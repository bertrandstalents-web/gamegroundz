/**
 * Global Custom Modals using Tailwind CSS
 * Replaces native confirm() and alert()
 */

function createModalContainer() {
    let container = document.getElementById('custom-modal-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'custom-modal-container';
        // z-[9999] ensures it sits on top of navbar and other fixed elements
        container.className = 'fixed inset-0 z-[9999] hidden items-center justify-center';
        container.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" id="custom-modal-backdrop"></div>
            <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
                <div class="flex justify-between items-center p-6 border-b border-slate-100">
                    <h3 class="text-xl font-bold text-dark" id="custom-modal-title"></h3>
                    <button id="custom-modal-close-x" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-500 transition-custom">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                
                <div class="p-6 overflow-y-auto w-full">
                    <p class="text-slate-600 mb-6" id="custom-modal-message" style="word-wrap: break-word;"></p>
                    <div id="custom-modal-input-container" class="mb-6 hidden">
                        <input type="text" id="custom-modal-input" class="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-custom">
                    </div>
                    
                    <div class="flex gap-4 mt-8" id="custom-modal-actions">
                        <!-- Buttons injected here -->
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(container);
    }
    return container;
}

window.showConfirmModal = function(title, message, confirmText = "Confirm", cancelText = "Cancel", isDanger = false) {
    return new Promise((resolve) => {
        const container = createModalContainer();
        const backdrop = document.getElementById('custom-modal-backdrop');
        const closeX = document.getElementById('custom-modal-close-x');
        const titleEl = document.getElementById('custom-modal-title');
        const messageEl = document.getElementById('custom-modal-message');
        const actionsEl = document.getElementById('custom-modal-actions');
        const inputContainer = document.getElementById('custom-modal-input-container');

        titleEl.textContent = title;
        if (isDanger) {
            titleEl.className = 'text-xl font-bold text-red-600';
        } else {
            titleEl.className = 'text-xl font-bold text-dark';
        }

        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        inputContainer.classList.add('hidden');
        
        const confirmBtnClass = isDanger 
            ? 'flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-custom shadow-glow'
            : 'flex-1 py-3 bg-primary hover:bg-primaryHover text-white rounded-xl font-bold transition-custom shadow-glow';

        actionsEl.innerHTML = `
            <button id="custom-modal-cancel-btn" class="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-custom">${cancelText}</button>
            <button id="custom-modal-confirm-btn" class="${confirmBtnClass}">${confirmText}</button>
        `;

        const cancelBtn = document.getElementById('custom-modal-cancel-btn');
        const confirmBtn = document.getElementById('custom-modal-confirm-btn');

        const cleanup = () => {
            container.classList.remove('flex');
            container.classList.add('hidden');
            document.body.style.overflow = '';
            
            backdrop.onclick = null;
            closeX.onclick = null;
            cancelBtn.onclick = null;
            confirmBtn.onclick = null;
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        backdrop.onclick = handleCancel;
        closeX.onclick = handleCancel;
        cancelBtn.onclick = handleCancel;
        confirmBtn.onclick = handleConfirm;

        container.classList.remove('hidden');
        container.classList.add('flex');
        document.body.style.overflow = 'hidden';
    });
};

window.showAlertModal = function(title, message, btnText = "OK", isError = false) {
    return new Promise((resolve) => {
        const container = createModalContainer();
        const backdrop = document.getElementById('custom-modal-backdrop');
        const closeX = document.getElementById('custom-modal-close-x');
        const titleEl = document.getElementById('custom-modal-title');
        const messageEl = document.getElementById('custom-modal-message');
        const actionsEl = document.getElementById('custom-modal-actions');
        const inputContainer = document.getElementById('custom-modal-input-container');

        titleEl.textContent = title;
        titleEl.className = isError ? 'text-xl font-bold text-red-600' : 'text-xl font-bold text-dark';
        
        // Strip out HTML tags for safety in standard alerts, or handle them gracefully
        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        inputContainer.classList.add('hidden');

        const okBtnClass = isError 
            ? 'flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-custom shadow-glow'
            : 'flex-1 py-3 bg-primary hover:bg-primaryHover text-white rounded-xl font-bold transition-custom shadow-glow';

        actionsEl.innerHTML = `
            <button id="custom-modal-ok-btn" class="${okBtnClass}">${btnText}</button>
        `;

        const okBtn = document.getElementById('custom-modal-ok-btn');

        const cleanup = () => {
            container.classList.remove('flex');
            container.classList.add('hidden');
            document.body.style.overflow = '';
            
            backdrop.onclick = null;
            closeX.onclick = null;
            okBtn.onclick = null;
        };

        const handleResolve = () => {
            cleanup();
            resolve();
        };

        backdrop.onclick = handleResolve;
        closeX.onclick = handleResolve;
        okBtn.onclick = handleResolve;

        container.classList.remove('hidden');
        container.classList.add('flex');
        document.body.style.overflow = 'hidden';
    });
};

window.showSuccessModal = function(title, message, btnText = "Awesome") {
    return new Promise((resolve) => {
        const container = createModalContainer();
        const backdrop = document.getElementById('custom-modal-backdrop');
        const closeX = document.getElementById('custom-modal-close-x');
        const titleEl = document.getElementById('custom-modal-title');
        const messageEl = document.getElementById('custom-modal-message');
        const actionsEl = document.getElementById('custom-modal-actions');
        const inputContainer = document.getElementById('custom-modal-input-container');

        titleEl.textContent = title;
        titleEl.className = 'text-2xl font-extrabold text-dark text-center w-full';
        
        // Add big green checkmark and message
        messageEl.innerHTML = `
            <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <i class="fa-solid fa-check text-4xl text-green-500"></i>
            </div>
            <div class="text-center text-slate-500 text-lg leading-relaxed">
                ${message.replace(/\n/g, '<br>')}
            </div>
        `;
        inputContainer.classList.add('hidden');

        actionsEl.innerHTML = `
            <button id="custom-modal-ok-btn" class="w-full bg-primary hover:bg-primaryHover text-white font-bold py-3.5 rounded-xl transition-custom shadow-glow">${btnText}</button>
        `;

        const okBtn = document.getElementById('custom-modal-ok-btn');

        const cleanup = () => {
            container.classList.remove('flex');
            container.classList.add('hidden');
            document.body.style.overflow = '';
            
            backdrop.onclick = null;
            closeX.onclick = null;
            okBtn.onclick = null;
        };

        const handleResolve = () => {
            cleanup();
            resolve();
        };

        backdrop.onclick = handleResolve;
        closeX.onclick = handleResolve;
        okBtn.onclick = handleResolve;

        container.classList.remove('hidden');
        container.classList.add('flex');
        document.body.style.overflow = 'hidden';
    });
};
