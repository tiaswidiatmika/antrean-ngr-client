// preload.js
const { ipcRenderer } = require('electron');

// 1. Intercept standard window.print calls (just in case)
window.print = () => {
    ipcRenderer.send('cetak-langsung');
};

// 2. The PHP file already calls `require('electron')`
// so it will naturally use the nodeIntegration we enabled in index.js.
// No extra bridge is needed for the PHP logic.