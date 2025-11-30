const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  });

  const targetUrl = 'https://festivalimngr.goruku.xyz/ambil_antrean.php';
  mainWindow.loadURL(targetUrl);
  mainWindow.removeMenu();

  mainWindow.webContents.on('did-finish-load', () => {
    // Block native dialog
    mainWindow.webContents.executeJavaScript(`
      window.print = function() {
        require('electron').ipcRenderer.send('cetak-langsung');
      };
      null;
    `);
    mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
//  PRINTER HELPERS (ESC/POS COMMANDS)
// ============================================================
const ESC = '\u001B';
const GS = '\u001D';

const CMD = {
  Init: ESC + '@',
  Cut: GS + 'V' + '\u0041' + '\u0000',
  NewLine: '\u000A',
  
  // Alignment
  Center: ESC + 'a' + '\u0001',
  Left: ESC + 'a' + '\u0000',
  
  // Fonts
  BoldOn: ESC + 'E' + '\u0001',
  BoldOff: ESC + 'E' + '\u0000',
  
  // Styling
  InverseOn: GS + 'B' + '\u0001',  // Black Background
  InverseOff: GS + 'B' + '\u0000', // Normal
  
  // Sizing
  SizeNormal: GS + '!' + '\u0000',
  SizeDouble: GS + '!' + '\u0011', // 2x W, 2x H
  SizeHuge: GS + '!' + '\u0033',   // 4x W, 4x H
  SizeTall: GS + '!' + '\u0001',   // 1x W, 2x H (Good for Logos)
};

// Function to build Native QR Code Commands
function getQRCmds(data) {
  const len = data.length + 3;
  const pL = len % 256;
  const pH = Math.floor(len / 256);
  
  // 1. Model (Model 2)
  let cmd = GS + '(k' + '\u0004\u0000' + '\u0031\u0041\u0032\u0000';
  // 2. Size (Module Size 6 - Big enough to scan)
  cmd += GS + '(k' + '\u0003\u0000' + '\u0031\u0043\u0006';
  // 3. Error Correction (Level L)
  cmd += GS + '(k' + '\u0003\u0000' + '\u0031\u0045\u0030';
  // 4. Store Data
  cmd += GS + '(k' + String.fromCharCode(pL) + String.fromCharCode(pH) + '\u0031\u0050\u0030' + data;
  // 5. Print QR
  cmd += GS + '(k' + '\u0003\u0000' + '\u0031\u0051\u0030';
  
  return cmd;
}

// ============================================================
//  MAIN PRINT HANDLER
// ============================================================
let isPrinting = false;

ipcMain.on('cetak-langsung', async (event) => {
  if (isPrinting) return;
  isPrinting = true;
  setTimeout(() => { isPrinting = false; }, 2000);

  const win = BrowserWindow.fromWebContents(event.sender);
  console.log("--- ⚡ GENERATING RAW TICKET ⚡ ---");

  // 1. SCRAPE DATA
  const data = await win.webContents.executeJavaScript(`
    (function() {
      const serviceEl = document.querySelector('.p-service-box') || document.querySelector('.p-service-name');
      const numberEl = document.querySelector('.p-number');
      const infoEl = document.querySelector('.p-info');
      
      return {
        service: serviceEl ? serviceEl.innerText.trim() : 'SERVICE',
        number: numberEl ? numberEl.innerText.trim() : '---',
        info: infoEl ? infoEl.innerText.trim() : new Date().toLocaleString()
      };
    })();
  `);

  // 2. BUILD TICKET BUFFER
  let buffer = '';
  
  // -- INITIALIZE --
  buffer += CMD.Init;
  buffer += CMD.Center;

  // -- FAKE LOGO (Stylized Text) --
  // We use Double Height text to mimic the logo header
  buffer += CMD.BoldOn + CMD.SizeDouble + "IMIGRASI" + CMD.SizeNormal + CMD.BoldOff + CMD.NewLine;
  buffer += CMD.BoldOn + "FESTIVAL" + CMD.BoldOff + CMD.NewLine;
  buffer += "Bali Ngurah Rai" + CMD.NewLine;
  buffer += CMD.NewLine;

  // -- SERVICE BOX (Black Background) --
  // We add spaces to make the black bar wider visually
  const paddedService = "   " + data.service + "   ";
  
  buffer += CMD.InverseOn; // Turn ON Black Background
  buffer += CMD.SizeTall;  // Make text taller
  buffer += paddedService;
  buffer += CMD.SizeNormal;
  buffer += CMD.InverseOff; // Turn OFF Black Background
  buffer += CMD.NewLine;
  buffer += CMD.NewLine;

  // -- QUEUE NUMBER --
  buffer += CMD.BoldOn + CMD.SizeHuge + data.number + CMD.SizeNormal + CMD.BoldOff + CMD.NewLine;
  buffer += CMD.NewLine;

  // -- DATE/INFO --
  buffer += data.info + CMD.NewLine;
  buffer += "--------------------------------" + CMD.NewLine;
  
  // -- QR CODE --
  // We generate the QR code command for the Ticket Number
  const qrData = data.service.substring(0,1) + "-" + data.number;
  buffer += getQRCmds(qrData); 
  
  // -- FOOTER --
  buffer += CMD.NewLine;
  buffer += CMD.BoldOn + "PLEASE WAIT FOR CALL" + CMD.BoldOff + CMD.NewLine;
  buffer += "THANK YOU" + CMD.NewLine;
  buffer += CMD.NewLine + CMD.NewLine + CMD.NewLine + CMD.NewLine; // Feed
  
  buffer += CMD.Cut;

  // 3. SEND TO SHARED PRINTER
  const printerPath = '\\\\localhost\\POS58 Printer';
  
  fs.writeFile(printerPath, buffer, (err) => {
    if (err) console.error("❌ Print Failed:", err);
    else console.log("✅ Ticket Sent!");
  });
});
