// index.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// 1. CLEAN STARTUP CONFIG
// Do not use 'kiosk-printing' yet. It hides errors.
// app.disableHardwareAcceleration(); // Only uncomment if app crashes frequently

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Wait until loaded to show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const targetUrl = 'https://festivalimngr.goruku.xyz/ambil_antrean.php';
  mainWindow.loadURL(targetUrl);
  mainWindow.removeMenu();

  // 2. FORCE PRINT STYLING (The fix for "Black Print")
  // We inject CSS that forces the print output to be black text on white paper.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      @media print {
        body, html, #app, .container {
          background-color: #FFFFFF !important;
          color: #000000 !important;
          margin: 0 !important; 
          padding: 0 !important;
        }
        /* Hide scrollbars and headers if any */
        ::-webkit-scrollbar { display: none; }
      }
    `);
    mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// =========================================================
// 3. INTELLIGENT PRINT HANDLER
// =========================================================
ipcMain.on('cetak-langsung', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  console.log("--- Processing Print Request ---");

  // A. FIND THE CORRECT PRINTER
  const printers = await win.webContents.getPrintersAsync();
  
  // LOGIC: specific name OR system default
  // Update this string to match your printer name exactly if you want to force it
  const targetPrinterName = "POS-58"; 
  
  let chosenPrinter = printers.find(p => p.name === targetPrinterName);
  
  if (!chosenPrinter) {
    console.log(`⚠️ Printer named "${targetPrinterName}" not found. Trying System Default...`);
    chosenPrinter = printers.find(p => p.isDefault);
  }

  if (!chosenPrinter) {
    console.error("❌ NO PRINTER FOUND! Please install a printer.");
    return;
  }

  console.log(`✅ Using Printer: ${chosenPrinter.name}`);

  // B. CONFIGURE OPTIONS
  const options = {
    silent: true,            // Silent mode
    deviceName: chosenPrinter.name,
    printBackground: false,  // CRITICAL: Must be FALSE for thermal printers
    margins: { marginType: 'none' }, 
    copies: 1
    // DO NOT SET pageSize HERE. Let the Windows Driver handle the roll length.
  };

  // C. EXECUTE
  win.webContents.print(options, (success, failureReason) => {
    if (!success) {
      console.error('❌ Print Failed:', failureReason);
      event.sender.send('status-cetak', { success: false, error: failureReason });
    } else {
      console.log('✅ Print Sent to Spooler');
      event.sender.send('status-cetak', { success: true });
    }
  });
});