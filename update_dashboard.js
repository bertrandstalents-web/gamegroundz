const fs = require('fs');

const path = 'owner-dashboard.html';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject HTML UI
const htmlInjectionPoint = '<!-- Media -->';
const htmlToInject = `
                <!-- Co-Hosts -->
                <div id="co-hosts-section" class="hidden mb-8">
                    <h2 class="text-xl font-bold text-dark mb-2 border-b border-slate-100 pb-2">8. Co-Hosts (Team)</h2>
                    <p class="text-xs text-slate-500 mb-4">Invite team members to help manage this facility. They will have full access to this facility's dashboard.</p>
                    
                    <div class="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                        <div id="co-hosts-list" class="space-y-3 mb-4">
                            <p class="text-sm text-slate-500 italic">No co-hosts added yet.</p>
                        </div>
                        
                        <div class="flex gap-2">
                            <input type="email" id="new-co-host-email" class="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-custom bg-white" placeholder="Colleague's email address">
                            <button type="button" onclick="addCoHost()" class="bg-primary/10 text-primary hover:bg-primary hover:text-white px-4 py-2 rounded-lg font-bold transition-custom flex items-center">
                                <i class="fa-solid fa-user-plus mr-2"></i> Invite
                            </button>
                        </div>
                    </div>
                </div>

                `;

if (!content.includes('id="co-hosts-section"')) {
    content = content.replace(htmlInjectionPoint, htmlToInject + htmlInjectionPoint);
} else {
    console.log("HTML already injected.");
}

// 2. Clear UI when creating a new facility
const openCreateAnchor = `const idField = document.getElementById('edit-facility-id');`;
const clearStr = `\n            const coHostsSec = document.getElementById('co-hosts-section'); if(coHostsSec) coHostsSec.classList.add('hidden');`;
if (content.includes(openCreateAnchor) && !content.includes(`document.getElementById('co-hosts-section')`)) {
    content = content.replace(openCreateAnchor, openCreateAnchor + clearStr);
}

// 3. Populate UI when editing a facility
const openEditAnchor = `let idField = document.getElementById('edit-facility-id');`;
const loadStr = `\n                if (typeof loadCoHosts === 'function') loadCoHosts(fac.id);`;
// We find where idField.value is set inside edit logic.
// Another anchor is `document.getElementById('fac-name').value = fac.name;`
const editNameAnchor = `document.getElementById('fac-name').value = fac.name;`;
if (content.includes(editNameAnchor) && !content.includes(`loadCoHosts(fac.id)`)) {
    content = content.replace(editNameAnchor, editNameAnchor + loadStr);
}

// 4. Add JS functions at the end of the script block
const jsFunctions = `
        async function loadCoHosts(facilityId) {
            const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
            const sec = document.getElementById('co-hosts-section');
            if(sec) sec.classList.remove('hidden');
            const list = document.getElementById('co-hosts-list');
            if(!list) return;
            list.innerHTML = '<p class="text-sm text-slate-500 italic">Loading co-hosts...</p>';
            try {
                const res = await fetch(\`\${API_BASE_URL}/api/host/facilities/\${facilityId}/co-hosts\`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    renderCoHosts(data.emails || []);
                }
            } catch(e) {
                list.innerHTML = '<p class="text-sm text-red-500 italic">Error loading co-hosts.</p>';
            }
        }

        function renderCoHosts(emails) {
            const list = document.getElementById('co-hosts-list');
            if(!list) return;
            if (!emails || emails.length === 0) {
                list.innerHTML = '<p class="text-sm text-slate-500 italic">No co-hosts added yet.</p>';
                return;
            }
            list.innerHTML = emails.map(email => \`
                <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 last:pb-0">
                    <span class="text-sm font-semibold text-slate-700">\${email}</span>
                    <button type="button" onclick="removeCoHost('\${email}')" class="text-red-500 hover:text-red-700 transition">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
            \`).join('');
        }

        async function addCoHost() {
            const emailInput = document.getElementById('new-co-host-email');
            const email = emailInput.value.trim();
            if (!email) return;
            
            const facilityId = document.getElementById('edit-facility-id') ? document.getElementById('edit-facility-id').value : null;
            if (!facilityId) return;
            
            const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
            
            try {
                const res = await fetch(\`\${API_BASE_URL}/api/host/facilities/\${facilityId}/co-hosts\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    emailInput.value = '';
                    renderCoHosts(data.emails);
                    if(typeof showAlertModal === 'function') showAlertModal('Success', 'Co-host invited successfully!');
                    else alert('Co-host invited successfully!');
                } else {
                    const errData = await res.json();
                    if(typeof showAlertModal === 'function') showAlertModal('Error', errData.error || 'Failed to add co-host');
                    else alert(errData.error || 'Failed to add co-host');
                }
            } catch (e) {
                if(typeof showAlertModal === 'function') showAlertModal('Error', 'Communication error. Please try again.');
                else alert('Communication error');
            }
        }

        async function removeCoHost(email) {
            const facilityId = document.getElementById('edit-facility-id') ? document.getElementById('edit-facility-id').value : null;
            if (!facilityId) return;
            
            if(!confirm(\`Are you sure you want to remove \${email} as a co-host?\`)) return;
            
            const API_BASE_URL = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
            
            try {
                const res = await fetch(\`\${API_BASE_URL}/api/host/facilities/\${facilityId}/co-hosts/\${encodeURIComponent(email)}\`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (res.ok) {
                    const data = await res.json();
                    renderCoHosts(data.emails);
                }
            } catch (e) {
                if(typeof showAlertModal === 'function') showAlertModal('Error', 'Failed to remove co-host');
                else alert('Failed to remove co-host');
            }
        }
    </script>
</body>`;

const scriptEndAnchor = `</script>\n</body>`;
if (content.includes(scriptEndAnchor) && !content.includes('async function loadCoHosts(facilityId)')) {
    content = content.replace(scriptEndAnchor, jsFunctions);
}

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully updated owner-dashboard.html');
