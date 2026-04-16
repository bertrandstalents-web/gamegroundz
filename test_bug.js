const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });

dom.window.document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded");
    const btn = dom.window.document.getElementById('auth-submit-btn');
    if (!btn) {
        console.log("Button not found!");
        return;
    }
    
    // Simulate filling login
    dom.window.document.getElementById('auth-email').value = "test@test.com";
    dom.window.document.getElementById('auth-password').value = "Password123";
    
    console.log("Button text before:", btn.textContent.trim());
    
    // Check if it has listeners
    btn.click();
    
    console.log("Button text after click:", btn.textContent.trim());
    
    setTimeout(() => {
        const err = dom.window.document.getElementById('auth-error');
        console.log("Error text:", err.textContent);
        console.log("Error visible?", !err.classList.contains('hidden'));
        console.log("Button text final:", btn.textContent.trim());
    }, 100);
});

dom.window.addEventListener("error", (event) => {
    console.log("JSDOM Error Caught:", event.error);
});
