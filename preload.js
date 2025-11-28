// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Allows the frontend to listen for success/failure messages
    onStatus: (callback) => ipcRenderer.on('status-cetak', callback)
});

window.addEventListener('DOMContentLoaded', () => {
    // OVERRIDE standard window.print()
    // When the PHP website calls window.print(), we hijack it here.
    const doPrint = () => {
        console.log('Preload: Intercepting print command...');
        ipcRenderer.send('cetak-langsung');
    };

    // Lock the print function so the website can't overwrite it back
    Object.defineProperty(window, 'print', {
        configurable: false,
        writable: false,
        value: doPrint
    });

    // Also catch Ctrl+P
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            doPrint();
        }
    });
});