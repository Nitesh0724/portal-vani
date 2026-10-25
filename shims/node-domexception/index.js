// Export the native global DOMException of Node.js 18+ to replace the deprecated node-domexception library
module.exports = globalThis.DOMException;
