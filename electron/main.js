const { app, BrowserWindow, Menu, Tray, nativeImage, shell, dialog, Notification } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const http = require("http")
const { autoUpdater } = require("electron-updater")

// Configure auto-updater
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

const isDev = process.env.NODE_ENV === "development"
const PORT = 3001
const NEXT_URL = `http://localhost:${PORT}`

let mainWindow = null
let tray = null
let nextServer = null
let serverStarting = false

// ─── Logging Setup ─────────────────────────────────────────────
const fs = require("fs")
const logFile = path.join(app.getPath("userData"), "app.log")

function log(msg) {
    const timestamp = new Date().toISOString()
    const content = `[${timestamp}] ${msg}\n`
    console.log(msg)
    try { fs.appendFileSync(logFile, content) } catch (e) { /* ignore */ }
}

log(`\n--- PresaleX Started (v${app.getVersion()}) ---`)
log(`Log file: ${logFile}`)

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
    return
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
            mainWindow.show()
        }
    })
}

// Native polling helper (replaces wait-on)
function waitForServer(url, timeout = 30000) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            if (Date.now() - start > timeout) {
                clearInterval(interval)
                reject(new Error("Timeout (30s) waiting for Next.js to start. Please check your network or restart."))
                return
            }
            http.get(url, (res) => {
                if (res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 404) {
                    clearInterval(interval)
                    resolve()
                }
            }).on("error", () => {
                // Ignore errors during polling
            })
        }, 1000)
    })
}

// ─── Start Next.js server ───────────────────────────────────────
function startNextServer() {
    if (isDev) return Promise.resolve() 
    if (serverStarting) return Promise.resolve()
    serverStarting = true

    return new Promise((resolve, reject) => {
        // Resolve path to the standalone server outside ASAR
        const resourcesPath = process.resourcesPath
        const standaloneDir = path.join(resourcesPath, "standalone")
        const serverPath = path.join(standaloneDir, "server.js")

        log(`[Main] Standalone Path: ${serverPath}`)

        // ─── Environment Variable Discovery ─────────────────────
        const baseEnv = {
            NODE_ENV: "production",
            PORT: String(PORT),
            HOSTNAME: "localhost",
            ELECTRON_RUN_AS_NODE: "1", // CRITICAL: forces electron to act as node
        }

        // 1. Merge currently active process env
        let productionEnv = { ...process.env, ...baseEnv }

        // 2. Try to load from local .env if it exists in standalone dir
        const envPath = path.join(standaloneDir, ".env")
        if (fs.existsSync(envPath)) {
            log(`[Main] Loading custom env from ${envPath}`)
            try {
                const envContent = fs.readFileSync(envPath, "utf8")
                envContent.split("\n").forEach(line => {
                    const [key, ...valueParts] = line.split("=")
                    if (key && valueParts.length > 0) {
                        const value = valueParts.join("=").trim()
                        productionEnv[key.trim()] = value.replace(/^["']|["']$/g, "")
                    }
                })
            } catch (e) {
                log(`[Main] Failed to parse .env: ${e.message}`)
            }
        }

        log(`[Main] DATABASE_URL present: ${!!productionEnv.DATABASE_URL}`)
        log(`[Main] AUTH_SECRET present: ${!!productionEnv.AUTH_SECRET}`)

        nextServer = spawn(process.execPath, [serverPath], {
            cwd: standaloneDir,
            env: productionEnv,
            stdio: ["ignore", "pipe", "pipe"],
        })

        nextServer.stdout.on("data", data => log(`[Next.js] ${data.toString().trim()}`))
        nextServer.stderr.on("data", data => log(`[Next.js err] ${data.toString().trim()}`))
        
        nextServer.on("error", (err) => {
            log(`[Next.js spawn error] ${err.message}`)
            reject(new Error(`Failed to spawn server.js: ${err.message}`))
        })

        waitForServer(NEXT_URL)
            .then(() => {
                log("[Main] Next.js server is ready.")
                resolve()
            })
            .catch(reject)
    })
}

// ─── Create Main Window ─────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
        backgroundColor: "#060C1A",
        icon: path.join(__dirname, "assets", "icon.png"),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            devTools: isDev,
        },
        show: false,
    })

    mainWindow.loadURL(NEXT_URL)

    mainWindow.once("ready-to-show", () => {
        mainWindow.show()
        if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" })
    })

    // Open external links in browser, not in app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(NEXT_URL)) {
            shell.openExternal(url)
            return { action: "deny" }
        }
        return { action: "allow" }
    })

    mainWindow.on("closed", () => { mainWindow = null })
}

// ─── System Tray ───────────────────────────────────────────────
function createTray() {
    try {
        const trayIcon = nativeImage.createFromPath(path.join(__dirname, "assets", "tray-icon.png"))
        tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

        const contextMenu = Menu.buildFromTemplate([
            { label: "PresaleX", enabled: false },
            { type: "separator" },
            { label: "Show App", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } else { createWindow() } } },
            { label: "New Deal", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.loadURL(`${NEXT_URL}/deals`) } } },
            { label: "Expert Panel", click: () => { if (mainWindow) { mainWindow.show(); mainWindow.loadURL(`${NEXT_URL}/chat`) } } },
            { type: "separator" },
            { label: "Quit PresaleX", click: () => { app.quit() } },
        ])

        tray.setToolTip("PresaleX — SC&L Expert Workspace")
        tray.setContextMenu(contextMenu)
        tray.on("click", () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show() } })
    } catch {
        console.log("Tray icon not found, skipping tray")
    }
}

// ─── App Menu ──────────────────────────────────────────────────
function createMenu() {
    const template = [
        {
            label: "PresaleX",
            submenu: [
                { label: "About PresaleX", click: () => { dialog.showMessageBox({ title: "PresaleX", message: "PresaleX v1.0.0\nSC&L Expert Workspace\n\nPowered by Gemini AI", detail: "Professional presale support for Supply Chain & Logistics teams." }) } },
                { type: "separator" },
                { role: "quit" },
            ],
        },
        {
            label: "View",
            submenu: [
                { label: "Dashboard", click: () => mainWindow?.loadURL(`${NEXT_URL}/`) },
                { label: "Expert Panel", click: () => mainWindow?.loadURL(`${NEXT_URL}/chat`) },
                { label: "Proposals", click: () => mainWindow?.loadURL(`${NEXT_URL}/proposals`) },
                { label: "Deals", click: () => mainWindow?.loadURL(`${NEXT_URL}/deals`) },
                { label: "Skills", click: () => mainWindow?.loadURL(`${NEXT_URL}/skills`) },
                { label: "Knowledge Base", click: () => mainWindow?.loadURL(`${NEXT_URL}/knowledge`) },
                { type: "separator" },
                { role: "reload" },
                { role: "toggleDevTools" },
                { role: "togglefullscreen" },
            ],
        },
        {
            label: "Window",
            submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
        },
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ─── Auto-Update Events ────────────────────────────────────────
function setupAutoUpdater() {
    if (isDev) return // skip in dev mode

    autoUpdater.on("checking-for-update", () => {
        console.log("[AutoUpdate] Checking for update...")
    })

    autoUpdater.on("update-available", (info) => {
        console.log("[AutoUpdate] Update available:", info.version)
        if (Notification.isSupported()) {
            new Notification({
                title: "PresaleX Update Available",
                body: `Version ${info.version} is downloading in the background...`,
                icon: path.join(__dirname, "assets", "icon.png"),
            }).show()
        }
    })

    autoUpdater.on("update-not-available", () => {
        console.log("[AutoUpdate] App is up to date.")
    })

    autoUpdater.on("update-downloaded", (info) => {
        console.log("[AutoUpdate] Update downloaded:", info.version)
        const response = dialog.showMessageBoxSync(mainWindow, {
            type: "info",
            title: "Update Ready — PresaleX",
            message: `Version ${info.version} is ready to install.`,
            detail: "Restart now to apply the update, or wait until next launch.",
            buttons: ["Restart Now", "Later"],
            defaultId: 0,
        })
        if (response === 0) {
            autoUpdater.quitAndInstall()
        }
    })

    autoUpdater.on("error", (err) => {
        console.error("[AutoUpdate] Error:", err.message)
    })

    // Check for updates 5 seconds after launch
    setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => {
            console.log("[AutoUpdate] Could not check:", err.message)
        })
    }, 5000)
}

// ─── App Events ────────────────────────────────────────────────
app.whenReady().then(async () => {
    try {
        log("Initialising modules...")
        await startNextServer()
        createWindow()
        createTray()
        createMenu()
        setupAutoUpdater()
    } catch (err) {
        log(`CRITICAL: Failed to start: ${err.message}`)
        dialog.showErrorBox("Startup Error", 
            `PresaleX failed to start. This happens if the background server cannot initialize.\n\nError: ${err.message}\n\nTechnical details: See ${logFile}`
        )
        app.quit()
    }
})

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
    if (!mainWindow) createWindow()
})

app.on("quit", () => {
    if (nextServer) {
        console.log("Stopping Next.js server...")
        nextServer.kill()
    }
})
