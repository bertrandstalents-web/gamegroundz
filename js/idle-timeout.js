/**
 * Idle Timeout Tracker
 * Automatically logs out the user after a set period of inactivity.
 */

(function() {
    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
    let lastActivityTime = Date.now();
    let idleCheckInterval;
    let isResetting = false;

    // Throttle the resets so we don't call Date.now() excessively on mousemove
    function resetIdleTime() {
        if (!isResetting) {
            isResetting = true;
            lastActivityTime = Date.now();
            setTimeout(() => { isResetting = false; }, 1000);
        }
    }

    function checkIdleTime() {
        if (Date.now() - lastActivityTime >= INACTIVITY_LIMIT_MS) {
            handleIdleTimeout();
        }
    }

    async function handleIdleTimeout() {
        // Stop checking
        clearInterval(idleCheckInterval);
        
        // Remove event listeners to prevent interference
        activityEvents.forEach(eventType => {
            document.removeEventListener(eventType, resetIdleTime);
        });
        
        try {
            // Call logout API
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            
            // Try to use the modern custom modal if it exists
            if (typeof window.showAlertModal === 'function') {
                await window.showAlertModal("Session Expired", "You have been logged out due to inactivity for security reasons.", "OK");
                window.location.href = 'index.html?reason=timeout';
            } else {
                alert("You have been logged out due to inactivity for security reasons.");
                window.location.href = 'index.html?reason=timeout';
            }
        } catch (error) {
            console.error("Error during auto-logout:", error);
            window.location.href = 'index.html?reason=timeout';
        }
    }

    // Set up event listeners for user activity
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    
    activityEvents.forEach(eventType => {
        document.addEventListener(eventType, resetIdleTime, { passive: true });
    });

    // Check periodically
    idleCheckInterval = setInterval(checkIdleTime, 30 * 1000); // Check every 30 seconds
})();
