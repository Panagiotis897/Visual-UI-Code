const App = {
    history: [],
    historyIndex: -1,
    maxHistory: 20,
    saveTimeout: null,
    isUpdatingCode: false,

    init: function() {
        this.renderRecentProjects(); // Render Hub
        this.initProjectHub();
        this.initSavedBlocks();
        this.loadProjectColors();
        Builder.init();
        this.setupEventListeners();
        this.setupTerminal();
        this.loadProject();
        this.initMonaco();
        this.setupResizers();
        this.loadLayout();
        this.initColorStudio();
        // Initial save
        this.saveState(); 
        this.updateCode();
    },

    // --- Navigation & UI Control ---
    goHome: function() {
        document.getElementById('project-hub').style.display = 'flex';
    },

    openProject: function() {
        document.getElementById('project-upload').click();
    },

    openInVSCode: function() {
        fetch('/api/run_command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'code .' })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                this.showModal({ title: 'Error', message: 'Failed to open VS Code: ' + data.error });
            } else {
                // Success - silent or toast? Let's assume silent is fine or console log
                console.log('Opened VS Code', data);
            }
        })
        .catch(err => {
            this.showModal({ title: 'Error', message: 'Connection error: ' + err.message });
        });
    },

    showHelp: function() {
        this.showModal({
            title: 'Help & Keyboard Shortcuts',
            message: '', // Custom content via innerHTML if generic modal supported it, but it uses innerText for message.
                         // We might need to extend showModal or just use a long string.
                         // Let's check showModal implementation.
            // showModal uses innerText for message (line 38).
            // I should update showModal to support HTML or just use newlines.
        });
        // Actually, let's update showModal to support HTML content or create a specific modal for help.
        // For now, I'll use a formatted string.
        const msg = 
`Navigation:
- Home: Ctrl + H (or Home button)
- New Project: Home Screen > Select Type
- Toggle Timeline: Ctrl + T

Editing:
- Undo: Ctrl + Z
- Redo: Ctrl + Y or Ctrl + Shift + Z
- Save: Ctrl + S
- Delete Element: Delete / Backspace

Views:
- Desktop/Tablet/Mobile: Toolbar Buttons
- Reset Layout: Toolbar Button`;

        this.showModal({
            title: 'Keyboard Shortcuts',
            message: msg
        });
    },

    toggleTimelinePanel: function() {
        const bottomPanel = document.getElementById('bottom-panel');
        const timelineContent = document.getElementById('panel-content-timeline');
        
        // Ensure panel is visible (height > 35px is a rough check for minimized state, 
        // but we should check if it's minimized by class or style)
        // Based on toggleBottomPanel: minimized sets height to 35px.
        const isMinimized = bottomPanel.clientHeight <= 35;
        
        if (isMinimized) {
            this.toggleBottomPanel(); // Restore
            this.switchBottomPanel('timeline');
        } else {
            // If already open, check if timeline is active
            if (timelineContent.style.display === 'flex' && timelineContent.classList.contains('active')) {
                this.toggleBottomPanel(); // Minimize
            } else {
                this.switchBottomPanel('timeline');
            }
        }
    },

    // --- Generic Modal Logic ---
    modalCallback: null,

    showModal: function(options) {
        const { title, message, showInput, defaultValue, onOk } = options;
        
        const titleEl = document.getElementById('generic-modal-title');
        const msgEl = document.getElementById('generic-modal-message');
        const inputWrapper = document.getElementById('generic-modal-input-wrapper');
        const input = document.getElementById('generic-modal-input');
        const modal = document.getElementById('generic-modal');

        if (titleEl) titleEl.innerText = title || 'Message';
        if (msgEl) msgEl.innerText = message || '';
        
        if (showInput && inputWrapper && input) {
            inputWrapper.style.display = 'block';
            input.value = defaultValue || '';
            setTimeout(() => input.focus(), 100);
        } else if (inputWrapper) {
            inputWrapper.style.display = 'none';
        }
        
        this.modalCallback = onOk;
        if (modal) modal.style.display = 'flex';
    },

    closeModal: function() {
        const modal = document.getElementById('generic-modal');
        if (modal) modal.style.display = 'none';
        this.modalCallback = null;
    },

    handleModalOk: function() {
        const input = document.getElementById('generic-modal-input');
        const value = input ? input.value : null;
        
        if (this.modalCallback) {
            this.modalCallback(value);
        }
        this.closeModal();
    },

    // --- Project Hub Logic ---
    startNewProject: function(type) {
        document.getElementById('project-hub').style.display = 'none';
        Builder.canvas.innerHTML = '';
        this.history = [];
        
        if (type === 'static') {
            Builder.canvas.innerHTML = '<div class="dropped-element" style="padding:40px; text-align:center;"><h1>New Static Site</h1><p>Start dragging components...</p></div>';
        } else if (type === 'js') {
             Builder.canvas.innerHTML = '<div class="dropped-element" style="padding:40px; text-align:center;"><h1>JS App</h1><div id="app"></div><script>console.log("App Started");</script></div>';
        } else {
             Builder.canvas.innerHTML = '<div class="dropped-element" style="padding:40px; text-align:center;"><h1>TypeScript Project</h1><p>TS Compiler Ready...</p></div>';
        }
        
        this.saveState();
        this.updateCode();
    },

    openRecent: function(name) {
        document.getElementById('project-hub').style.display = 'none';
        // Simulate loading
        console.log('Loading project:', name);
    },

    renderRecentProjects: function(filter = '') {
        const list = document.getElementById('recent-projects-list');
        if (!list) return;
        const projects = [
            { name: 'Portfolio', path: '~/projects/portfolio', date: '2h ago', type: 'js' },
            { name: 'E-commerce UI', path: '~/projects/shop', date: '1d ago', type: 'ts' },
            { name: 'Dashboard', path: '~/projects/admin', date: '3d ago', type: 'static' }
        ];
        
        const filtered = projects.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            list.innerHTML = '<div style="color:#888; padding:20px;">No projects found.</div>';
            return;
        }

        list.innerHTML = filtered.map(p => `
            <div class="recent-item" onclick="App.openRecent('${p.name}')">
                <div class="icon"><i class="fas fa-${p.type === 'static' ? 'globe' : (p.type === 'ts' ? 'microsoft' : 'js')}"></i></div>
                <div class="details">
                    <span class="name">${p.name}</span>
                    <span class="path">${p.path}</span>
                </div>
                <span class="date">${p.date}</span>
            </div>
        `).join('');
    },

    initProjectHub: function() {
        const searchInput = document.getElementById('hub-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderRecentProjects(e.target.value);
            });
        }
        
        // Tab switching logic
        const tabs = document.querySelectorAll('.hub-nav li');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const tabName = tab.dataset.hubTab;
                const list = document.getElementById('recent-projects-list');
                const title = document.querySelector('.hub-recent h3');

                if (tabName === 'templates') {
                     if (title) title.innerText = 'Templates';
                     list.innerHTML = `
                        <div class="recent-item" onclick="App.startNewProject('static')">
                            <div class="icon"><i class="fas fa-columns"></i></div>
                            <div class="details"><span class="name">Landing Page</span><span class="path">Basic Layout</span></div>
                        </div>
                        <div class="recent-item" onclick="App.startNewProject('js')">
                             <div class="icon"><i class="fas fa-chart-line"></i></div>
                             <div class="details"><span class="name">Admin Dashboard</span><span class="path">React + Tailwind</span></div>
                         </div>
                     `;
                } else {
                    if (title) title.innerText = 'Recent Projects';
                    this.renderRecentProjects(searchInput ? searchInput.value : '');
                }
            });
        });
    },

    // --- Color Studio Logic ---
    toggleColorStudio: function() {
        document.getElementById('color-studio-modal').style.display = 'flex';
        this.updateColorStudio();
    },

    closeColorStudio: function() {
        document.getElementById('color-studio-modal').style.display = 'none';
    },

    initColorStudio: function() {
        const hex = document.getElementById('cs-hex');
        const r = document.getElementById('cs-r');
        const g = document.getElementById('cs-g');
        const b = document.getElementById('cs-b');
        const h = document.getElementById('cs-h');
        const s = document.getElementById('cs-s');
        const l = document.getElementById('cs-l');
        
        // Initial Sync
        const syncAll = (color) => {
            const rgb = this.hexToRgb(color);
            if (rgb) {
                r.value = rgb.r; g.value = rgb.g; b.value = rgb.b;
                const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
                if (hsl) {
                    h.value = Math.round(hsl.h * 360);
                    s.value = Math.round(hsl.s * 100);
                    l.value = Math.round(hsl.l * 100);
                }
                this.updateColorStudio(color);
            }
        };

        // Initialize
        if (hex) syncAll(hex.value);

        const updateFromHex = () => {
            let val = hex.value;
            if (val.startsWith('#') && val.length === 7) {
                syncAll(val);
            }
        };

        const updateFromRgb = () => {
            const val = this.rgbToHex(r.value, g.value, b.value);
            hex.value = val;
            // Update HSL
            const hsl = this.rgbToHsl(r.value, g.value, b.value);
            if (hsl) {
                h.value = Math.round(hsl.h * 360);
                s.value = Math.round(hsl.s * 100);
                l.value = Math.round(hsl.l * 100);
            }
            this.updateColorStudio(val);
        };

        const updateFromHsl = () => {
            const rgb = this.hslToRgb(h.value / 360, s.value / 100, l.value / 100);
            r.value = Math.round(rgb.r);
            g.value = Math.round(rgb.g);
            b.value = Math.round(rgb.b);
            const val = this.rgbToHex(rgb.r, rgb.g, rgb.b);
            hex.value = val;
            this.updateColorStudio(val);
        };

        if (hex) hex.addEventListener('input', updateFromHex);
        if (r) r.addEventListener('input', updateFromRgb);
        if (g) g.addEventListener('input', updateFromRgb);
        if (b) b.addEventListener('input', updateFromRgb);
        if (h) h.addEventListener('input', updateFromHsl);
        if (s) s.addEventListener('input', updateFromHsl);
        if (l) l.addEventListener('input', updateFromHsl);
    },

    updateColorStudio: function(color) {
        if (!color) color = document.getElementById('cs-hex').value;
        
        // Update preview
        const preview = document.getElementById('cs-preview');
        if (preview) preview.style.backgroundColor = color;
        
        const contrastBox = document.getElementById('cs-contrast-box');
        if (contrastBox) contrastBox.style.backgroundColor = color;
        
        // Calculate contrast
        const rgb = this.hexToRgb(color);
        if (!rgb) return;
        
        // Calculate luminance
        // sRGB formula
        const getLum = (c) => {
            const v = c / 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const L = 0.2126 * getLum(rgb.r) + 0.7152 * getLum(rgb.g) + 0.0722 * getLum(rgb.b);
        
        // Contrast with white (L=1.0)
        const ratio = (1.0 + 0.05) / (L + 0.05);
        
        const valEl = document.getElementById('cs-contrast-val');
        const badgeEl = document.getElementById('cs-contrast-badge');
        
        if (valEl) valEl.innerText = ratio.toFixed(2) + ':1';
        
        if (badgeEl) {
            if (ratio >= 4.5) {
                badgeEl.className = 'badge pass';
                badgeEl.innerText = 'AA Pass';
                badgeEl.style.backgroundColor = '#4caf50';
            } else if (ratio >= 3.0) {
                 badgeEl.className = 'badge pass';
                 badgeEl.style.backgroundColor = 'orange';
                 badgeEl.innerText = 'AA Large';
            } else {
                badgeEl.className = 'badge fail';
                badgeEl.innerText = 'Fail';
                badgeEl.style.backgroundColor = '#f44336';
            }
        }
    },

    saveColorFromStudio: function() {
        const color = document.getElementById('cs-hex').value;
        const grid = document.getElementById('project-colors');
        const div = document.createElement('div');
        div.className = 'color-swatch';
        div.style.setProperty('--bg', color);
        div.title = color;
        div.innerHTML = `<div class="color-preview"></div><div class="color-info">${color}</div>`;
        grid.appendChild(div);
        this.closeColorStudio();
    },

    hexToRgb: function(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    },

    rgbToHex: function(r, g, b) {
        return "#" + ((1 << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b)).toString(16).slice(1);
    },

    rgbToHsl: function(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    },

    hslToRgb: function(h, s, l) {
        let r, g, b;

        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    },
    // -------------------------

    toggleCategory: function(header) {
        const category = header.parentElement;
        category.classList.toggle('collapsed');
    },

    setupResizers: function() {
        const createResizer = (resizerId, direction, onResize, onStop) => {
            const resizer = document.getElementById(resizerId);
            if (!resizer) return;

            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
                resizer.classList.add('resizing');
                document.body.classList.add('is-resizing');
                
                const startX = e.clientX;
                const startY = e.clientY;
                
                const onMouseMove = (moveEvent) => {
                    onResize(moveEvent.clientX - startX, moveEvent.clientY - startY, moveEvent);
                };
                
                const onMouseUp = () => {
                    document.body.style.cursor = '';
                    resizer.classList.remove('resizing');
                    document.body.classList.remove('is-resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (onStop) onStop();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        };

        // Sidebar Resizer
        const sidebar = document.getElementById('component-sidebar');
        if (sidebar) {
            createResizer('resizer-sidebar', 'horizontal', (dx, dy, e) => {
                const newWidth = e.clientX; 
                if (newWidth > 150 && newWidth < 500) {
                    sidebar.style.width = newWidth + 'px';
                }
            }, () => this.saveLayout());
        }

        // Code/Preview Resizer
        const codePanel = document.getElementById('code-editor-panel');
        const previewPanel = document.getElementById('preview-panel');
        const workspace = document.querySelector('.workspace');
        
        if (codePanel && previewPanel && workspace) {
            createResizer('resizer-code', 'horizontal', (dx, dy, e) => {
                const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
                const resizerWidth = 5;
                const availableWidth = workspace.clientWidth - sidebarWidth - resizerWidth;
                
                // Calculate new width based on mouse position relative to workspace start
                // Mouse X - Sidebar Width
                let newCodeWidth = e.clientX - sidebarWidth;
                
                // Constraints
                if (newCodeWidth < 100) newCodeWidth = 100;
                if (newCodeWidth > availableWidth - 100) newCodeWidth = availableWidth - 100;
                
                const codePercent = (newCodeWidth / availableWidth) * 100;
                
                codePanel.style.flex = `0 0 ${codePercent}%`;
                previewPanel.style.flex = `0 0 ${100 - codePercent}%`;
            }, () => this.saveLayout());
        }

        // Terminal Resizer
        const editorContent = document.getElementById('editor-content-wrapper');
        const terminal = document.getElementById('bottom-panel');
        
        if (editorContent && terminal && codePanel) {
            createResizer('resizer-terminal', 'vertical', (dx, dy, e) => {
                const codePanelRect = codePanel.getBoundingClientRect();
                const panelTop = codePanelRect.top;
                const panelHeight = codePanelRect.height;
                
                let newEditorHeight = e.clientY - panelTop;
                
                // Constraints
                if (newEditorHeight < 50) newEditorHeight = 50;
                if (newEditorHeight > panelHeight - 35) newEditorHeight = panelHeight - 35; // Min height for bottom panel header
                
                const editorPercent = (newEditorHeight / panelHeight) * 100;
                
                editorContent.style.height = `${editorPercent}%`;
                terminal.style.height = `${100 - editorPercent}%`;
            }, () => this.saveLayout());
        }
    },

    // --- Bottom Panel Logic ---
    switchBottomPanel: function(tabName) {
        // Toggle buttons
        const buttons = document.querySelectorAll('.panel-tabs button');
        buttons.forEach(b => {
            if (b.innerText.toLowerCase().includes(tabName) || b.getAttribute('onclick').includes(tabName)) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });

        // Toggle content
        document.querySelectorAll('.bottom-panel .panel-content').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('active');
        });

        const activePanel = document.getElementById('panel-content-' + tabName);
        if (activePanel) {
            activePanel.style.display = 'flex';
            activePanel.classList.add('active');
        }
    },

    toggleBottomPanel: function() {
        const panel = document.getElementById('bottom-panel');
        const icon = document.querySelector('.panel-actions i.fa-chevron-down, .panel-actions i.fa-chevron-up');
        
        if (panel.clientHeight > 35) {
            // Minimize
            panel.dataset.prevHeight = panel.style.height || '200px';
            panel.style.height = '35px';
            if (icon) { icon.className = 'fas fa-chevron-up'; icon.parentElement.title = 'Restore'; }
        } else {
            // Restore
            panel.style.height = panel.dataset.prevHeight || '200px';
            if (icon) { icon.className = 'fas fa-chevron-down'; icon.parentElement.title = 'Minimize'; }
        }
    },

    // --- Animation Studio Logic ---
    animations: {}, 
    currentAnim: null,

    createAnimation: function() {
        this.showModal({
            title: 'New Animation',
            message: "Enter animation name (e.g., 'slide-in'):",
            showInput: true,
            onOk: (name) => {
                if (!name) return;
                if (this.animations[name]) { 
                    App.showModal({ title: 'Error', message: 'Animation already exists!' }); 
                    return; 
                }
                
                this.animations[name] = { duration: 1, iter: 1, keyframes: [] };
                
                const select = document.getElementById('anim-select');
                const opt = document.createElement('option');
                opt.value = name;
                opt.innerText = name;
                select.appendChild(opt);
                select.value = name;
                this.selectAnimation(name);
            }
        });
    },

    selectAnimation: function(name) {
        if (!name) return;
        this.currentAnim = name;
        const anim = this.animations[name];
        
        document.getElementById('anim-duration').value = anim.duration;
        document.getElementById('anim-iter').value = anim.iter;
        
        this.renderTimeline();
    },

    renderTimeline: function() {
        const trackContainer = document.getElementById('timeline-tracks');
        if (!this.currentAnim) {
            trackContainer.innerHTML = '<div class="empty-state">Select an animation</div>';
            return;
        }
        
        const anim = this.animations[this.currentAnim];
        
        let html = '';
        anim.keyframes.sort((a,b) => a.time - b.time).forEach((kf, idx) => {
            html += `
            <div class="timeline-kf" style="margin-bottom: 5px; background: #333; padding: 4px; border-radius: 4px; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--text-accent); font-weight:bold;">${kf.time}%</span>
                <span style="font-size:11px; color:#888;">${Object.keys(kf.props).length} props</span>
                <button onclick="App.removeKeyframe(${idx})" style="color:red; background:none; border:none; cursor:pointer;">&times;</button>
            </div>`;
        });
        
        if (anim.keyframes.length === 0) {
            html = '<div style="padding:10px; color:#666;">No keyframes. Click "Add Keyframe".</div>';
        }
        
        trackContainer.innerHTML = html;
    },

    addKeyframe: function() {
        if (!this.currentAnim) { 
            this.showModal({ title: 'Info', message: 'Select an animation first' }); 
            return; 
        }
        
        this.showModal({
            title: 'Add Keyframe',
            message: 'Enter time percentage (0-100):',
            showInput: true,
            defaultValue: '0',
            onOk: (time) => {
                if (time === null) return;
                
                const props = {};
                if (Builder.selectedElement) {
                    if (Builder.selectedElement.style.transform) props['transform'] = Builder.selectedElement.style.transform;
                    if (Builder.selectedElement.style.opacity) props['opacity'] = Builder.selectedElement.style.opacity;
                    if (Builder.selectedElement.style.backgroundColor) props['background-color'] = Builder.selectedElement.style.backgroundColor;
                }
                
                this.animations[this.currentAnim].keyframes.push({
                    time: parseInt(time),
                    props: props
                });
                
                this.renderTimeline();
                this.generateAnimationCSS();
            }
        });
    },
    
    removeKeyframe: function(idx) {
        if (!this.currentAnim) return;
        this.animations[this.currentAnim].keyframes.splice(idx, 1);
        this.renderTimeline();
        this.generateAnimationCSS();
    },

    generateAnimationCSS: function() {
        let css = '';
        for (let name in this.animations) {
            const anim = this.animations[name];
            css += `@keyframes ${name} {\n`;
            anim.keyframes.forEach(kf => {
                css += `  ${kf.time}% { `;
                for (let p in kf.props) css += `${p}: ${kf.props[p]}; `;
                css += `}\n`;
            });
            css += `}\n`;
            
            css += `.anim-${name} { animation: ${name} ${anim.duration}s ${anim.iter === 'inf' ? 'infinite' : anim.iter} ease-in-out forwards; }\n`;
        }
        
        const frame = document.getElementById('preview-frame');
        // Fix for non-iframe preview
        if (!frame) {
             let style = document.getElementById('vuc-animations');
             if (!style) {
                 style = document.createElement('style');
                 style.id = 'vuc-animations';
                 document.head.appendChild(style);
             }
             style.innerHTML = css;
             return;
        }
        const doc = frame.contentDocument || frame.contentWindow.document;
        let style = doc.getElementById('vuc-animations');
        if (!style) {
            style = doc.createElement('style');
            style.id = 'vuc-animations';
            doc.head.appendChild(style);
        }
        style.innerHTML = css;
    },

    playAnimation: function() {
        if (!this.currentAnim || !Builder.selectedElement) {
            this.showModal({ title: 'Info', message: 'Select an animation and an element to play.' });
            return;
        }
        
        const el = Builder.selectedElement;
        const cls = `anim-${this.currentAnim}`;
        
        el.classList.remove(cls);
        void el.offsetWidth; 
        el.classList.add(cls);
    },
    
    pauseAnimation: function() {
        if (Builder.selectedElement) Builder.selectedElement.style.animationPlayState = 'paused';
    },

    stopAnimation: function() {
        if (Builder.selectedElement && this.currentAnim) {
             Builder.selectedElement.classList.remove(`anim-${this.currentAnim}`);
        }
    },

    // --- Saved Blocks Logic ---
    savedBlocks: [],

    initSavedBlocks: function() {
        const stored = localStorage.getItem('vuc_saved_blocks');
        if (stored) {
            this.savedBlocks = JSON.parse(stored);
        }
        this.renderSavedBlocks();
    },

    saveCurrentBlock: function() {
        const el = Builder.selectedElement;
        if (!el) {
            this.showModal({ title: 'Info', message: 'Select an element to save.' });
            return;
        }

        this.showModal({
            title: 'Save Block',
            message: 'Enter name for this block:',
            showInput: true,
            defaultValue: 'My Block',
            onOk: (name) => {
                if (!name) return;

                // Clone and clean
                const clone = el.cloneNode(true);
                clone.classList.remove('selected');
                clone.classList.remove('dropped-element'); 
                
                // Use a temporary container to get HTML
                const temp = document.createElement('div');
                temp.appendChild(clone);
                
                const block = {
                    id: 'block-' + Date.now(),
                    name: name,
                    html: temp.innerHTML,
                    timestamp: new Date().toLocaleString()
                };

                this.savedBlocks.push(block);
                this.saveBlocksToStorage();
                this.renderSavedBlocks();
                
                // Show sidebar
                this.switchSidebar('html');
                const cat = document.getElementById('category-saved-blocks');
                if (cat) {
                    cat.style.display = 'block';
                    cat.classList.remove('collapsed');
                }
            }
        });
    },

    deleteSavedBlock: function(id) {
        this.showModal({
            title: 'Delete Block',
            message: 'Are you sure you want to delete this saved block?',
            showInput: false,
            onOk: () => {
                this.savedBlocks = this.savedBlocks.filter(b => b.id !== id);
                this.saveBlocksToStorage();
                this.renderSavedBlocks();
            }
        });
    },

    saveBlocksToStorage: function() {
        localStorage.setItem('vuc_saved_blocks', JSON.stringify(this.savedBlocks));
    },

    renderSavedBlocks: function() {
        const container = document.getElementById('saved-blocks-list');
        const category = document.getElementById('category-saved-blocks');
        
        if (!container || !category) return;

        if (this.savedBlocks.length === 0) {
            category.style.display = 'none';
            return;
        }

        category.style.display = 'block';
        container.innerHTML = '';

        this.savedBlocks.forEach(block => {
            const item = document.createElement('div');
            item.className = 'draggable-item';
            item.draggable = true;
            item.dataset.type = 'saved-block';
            item.dataset.blockId = block.id;
            
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <span><i class="fas fa-cube"></i> ${block.name}</span>
                    <i class="fas fa-trash" style="color:#666; font-size:10px; cursor:pointer;" onclick="event.stopPropagation(); App.deleteSavedBlock('${block.id}')"></i>
                </div>
            `;
            
            // Drag Start
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', 'saved-block');
                e.dataTransfer.setData('application/vuc-block-id', block.id);
                e.dataTransfer.effectAllowed = 'copy';
                if (window.Builder) window.Builder.draggedType = 'saved-block';
            });
            
            container.appendChild(item);
        });
    },
    
    // --- Script Editor Logic ---
    runScript: function() {
        let code = '';
        
        if (window.scriptEditor) {
            code = window.scriptEditor.getValue();
        } else {
            const scriptArea = document.getElementById('script-editor-area');
            if (scriptArea) code = scriptArea.value;
        }

        if (!code || !code.trim()) {
             this.logConsole('Script is empty.', 'info');
             return;
        }

        this.logConsole('Running script...', 'info');
        
        try {
            // Execute in global scope but try to target canvas
            // We wrap in an IIFE
            const safeCode = `(function() { 
                const canvas = document.getElementById('preview-canvas');
                ${code} 
            })();`;
            
            window.eval(safeCode);
            this.logConsole('Script executed.', 'success');
        } catch (e) {
            this.logConsole(`Script Error: ${e.message}`, 'error');
        }
    },

    // --- JS Console Logic ---
    runConsole: function(code) {
        if (!code) code = document.getElementById('console-input').value;
        if (!code) return;
        
        this.logConsole(`> ${code}`, 'info');
        
        try {
            // Fix: Use window instead of iframe
            const result = window.eval(code);
            this.logConsole(`<- ${result}`, 'success');
        } catch (e) {
            this.logConsole(`Error: ${e.message}`, 'error');
        }
        
        document.getElementById('console-input').value = '';
    },

    logConsole: function(msg, type='info') {
        const out = document.getElementById('js-console-output');
        const div = document.createElement('div');
        div.className = `log-${type}`;
        div.innerText = msg;
        div.style.borderBottom = '1px solid #333';
        div.style.padding = '2px 0';
        if (type === 'error') div.style.color = '#f44336';
        if (type === 'success') div.style.color = '#4caf50';
        
        out.appendChild(div);
        out.scrollTop = out.scrollHeight;
    },

    clearConsole: function() {
        document.getElementById('js-console-output').innerHTML = '<div class="log-info">Console cleared.</div>';
    },

    saveLayout: function() {
        const sidebar = document.getElementById('component-sidebar');
        const codePanel = document.getElementById('code-editor-panel');
        const previewPanel = document.getElementById('preview-panel');
        const editorContent = document.getElementById('editor-content-wrapper');
        const bottomPanel = document.getElementById('bottom-panel');

        // Find active bottom tab
        const activeTabBtn = document.querySelector('.panel-tabs button.active');
        let activeTab = 'terminal'; // Default
        if (activeTabBtn) {
            // Infer tab from onclick attribute or text
            const onclick = activeTabBtn.getAttribute('onclick');
            if (onclick && onclick.includes("'timeline'")) activeTab = 'timeline';
            else if (onclick && onclick.includes("'console'")) activeTab = 'console';
            else if (onclick && onclick.includes("'script'")) activeTab = 'script';
        }

        const layout = {
            sidebarWidth: sidebar ? sidebar.style.width : '',
            codePanelFlex: codePanel ? codePanel.style.flex : '',
            previewPanelFlex: previewPanel ? previewPanel.style.flex : '',
            editorHeight: editorContent ? editorContent.style.height : '',
            terminalHeight: bottomPanel ? bottomPanel.style.height : '',
            activeBottomTab: activeTab
        };
        localStorage.setItem('vuc_layout', JSON.stringify(layout));
    },

    loadLayout: function() {
        try {
            const layout = JSON.parse(localStorage.getItem('vuc_layout'));
            if (layout) {
                const sidebar = document.getElementById('component-sidebar');
                const codePanel = document.getElementById('code-editor-panel');
                const previewPanel = document.getElementById('preview-panel');
                const editorContent = document.getElementById('editor-content-wrapper');
                const bottomPanel = document.getElementById('bottom-panel');

                if (layout.sidebarWidth && sidebar) sidebar.style.width = layout.sidebarWidth;
                if (layout.codePanelFlex && codePanel) codePanel.style.flex = layout.codePanelFlex;
                if (layout.previewPanelFlex && previewPanel) previewPanel.style.flex = layout.previewPanelFlex;
                if (layout.editorHeight && editorContent) editorContent.style.height = layout.editorHeight;
                if (layout.terminalHeight && bottomPanel) bottomPanel.style.height = layout.terminalHeight;
                
                if (layout.activeBottomTab) {
                    this.switchBottomPanel(layout.activeBottomTab);
                }
            }
        } catch(e) { console.error('Error loading layout', e); }
    },

    resetLayout: function() {
        this.showModal({
            title: 'Reset Layout',
            message: 'Are you sure you want to reset the layout to default settings?',
            showInput: false,
            onOk: () => {
                // Clear saved layout
                localStorage.removeItem('vuc_layout');
                
                // Reset Sidebar
                const sidebar = document.getElementById('component-sidebar');
                if (sidebar) sidebar.style.width = '';
                
                // Reset Code/Preview Split
                const codePanel = document.getElementById('code-editor-panel');
                const previewPanel = document.getElementById('preview-panel');
                if (codePanel) codePanel.style.flex = '';
                if (previewPanel) previewPanel.style.flex = '';
                
                // Reset Editor/Terminal Split
                const editorContent = document.getElementById('editor-content-wrapper');
                const bottomPanel = document.getElementById('bottom-panel');
                if (editorContent) editorContent.style.height = '';
                if (bottomPanel) bottomPanel.style.height = '';
                
                // Feedback
                App.showModal({ title: 'Success', message: 'Layout has been reset to default configuration.' });
            }
        });
    },

    // --- Color Management ---
    projectColors: [],

    loadProjectColors: function() {
        try {
            const colors = JSON.parse(localStorage.getItem('vuc_project_colors') || '[]');
            this.projectColors = colors;
        } catch(e) { this.projectColors = []; }
    },

    saveProjectColors: function() {
        localStorage.setItem('vuc_project_colors', JSON.stringify(this.projectColors));
    },

    openColorPaletteManager: function() {
        // Modal for managing colors
        const container = document.createElement('div');
        
        // Import Area
        const importLabel = document.createElement('label');
        importLabel.innerText = 'Import Colors (Hex codes separated by space/comma/newline):';
        importLabel.style.display = 'block';
        importLabel.style.marginBottom = '5px';
        container.appendChild(importLabel);

        const textarea = document.createElement('textarea');
        textarea.style.width = '100%';
        textarea.style.height = '100px';
        textarea.className = 'prop-input';
        textarea.placeholder = '#ffffff, #000000, #ff0000';
        container.appendChild(textarea);

        // Swatch List
        const listLabel = document.createElement('div');
        listLabel.innerText = 'Current Palette (Click to remove):';
        listLabel.style.margin = '10px 0 5px';
        container.appendChild(listLabel);

        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexWrap = 'wrap';
        list.style.gap = '5px';
        
        const renderList = () => {
            list.innerHTML = '';
            this.projectColors.forEach((c, idx) => {
                const swatch = document.createElement('div');
                swatch.style.width = '24px';
                swatch.style.height = '24px';
                swatch.style.backgroundColor = c;
                swatch.style.border = '1px solid #555';
                swatch.style.cursor = 'pointer';
                swatch.title = 'Remove ' + c;
                swatch.onclick = () => {
                    this.projectColors.splice(idx, 1);
                    this.saveProjectColors();
                    renderList();
                };
                list.appendChild(swatch);
            });
        };
        renderList();
        container.appendChild(list);

        this.showModal({
            title: 'Manage Color Palette',
            message: '', 
            showInput: false,
            onOk: () => {
                // Process Import
                const text = textarea.value;
                if (text) {
                    const matches = text.match(/#[0-9a-fA-F]{3,8}/g);
                    if (matches) {
                        matches.forEach(c => {
                            if (!this.projectColors.includes(c)) this.projectColors.push(c);
                        });
                        this.saveProjectColors();
                    }
                }
                // Refresh Inspector if open
                if (Builder.selectedElement) this.updatePropertyInspector(Builder.selectedElement);
            }
        });
        
        // Append custom container to modal message body
        const msgEl = document.getElementById('generic-modal-message');
        if (msgEl) {
            msgEl.innerHTML = '';
            msgEl.appendChild(container);
        }
    },

    // --- Code Highlighting ---
    highlightCodeForElement: function(el) {
        if (!window.monacoEditor) return;
        const model = window.monacoEditor.getModel();
        if (!model) return;
        
        let range = null;

        // 1. Try ID
        if (el.id) {
            const matches = model.findMatches('id="' + el.id + '"', false, false, false, null, true);
            if (matches && matches.length > 0) range = matches[0].range;
        }

        // 2. Try Class + Tag
        if (!range && el.className && typeof el.className === 'string') {
             const classes = el.className.replace('selected', '').replace('dropped-element', '').trim();
             if (classes) {
                 const pattern = 'class="' + classes + '"';
                 const matches = model.findMatches(pattern, false, false, false, null, true);
                 if (matches && matches.length > 0) range = matches[0].range;
             }
        }
        
        if (range) {
            window.monacoEditor.revealRangeInCenter(range);
            window.monacoEditor.setSelection(range);
        }
    },

    initMonaco: function() {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            // Main Code Editor
            window.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
                value: '',
                language: 'html',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: false }
            });

            // Script Editor
            const scriptContainer = document.getElementById('monaco-script-editor');
            if (scriptContainer) {
                window.scriptEditor = monaco.editor.create(scriptContainer, {
                    value: '// Write JavaScript here...\n// It runs in the context of the app (use window or document)\n\nconsole.log("Hello from Script Editor");',
                    language: 'javascript',
                    theme: 'vs-dark',
                    automaticLayout: true,
                    minimap: { enabled: false }
                });
            }

            // Bi-directional sync for main editor
            window.monacoEditor.onDidChangeModelContent(() => {
                if (App.isUpdatingCode) return;
                App.syncCodeToCanvas();
            });
        });
    },

    showSyncFeedback: function() {
        let feedback = document.getElementById('sync-feedback');
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.id = 'sync-feedback';
            feedback.style.position = 'fixed';
            feedback.style.bottom = '20px';
            feedback.style.right = '20px';
            feedback.style.background = '#007acc';
            feedback.style.color = 'white';
            feedback.style.padding = '8px 12px';
            feedback.style.borderRadius = '4px';
            feedback.style.fontSize = '12px';
            feedback.style.opacity = '0';
            feedback.style.transition = 'opacity 0.3s';
            feedback.style.zIndex = '10000';
            feedback.style.pointerEvents = 'none';
            feedback.innerText = 'Synced';
            document.body.appendChild(feedback);
        }
        
        feedback.style.opacity = '1';
        clearTimeout(this.feedbackTimeout);
        this.feedbackTimeout = setTimeout(() => {
            feedback.style.opacity = '0';
        }, 1000);
    },

    switchSidebar: function(tab) {
        // Handle 'components' legacy call
        if (tab === 'components') tab = 'html';

        // Toggle active button
        const buttons = document.querySelectorAll('.sidebar-tabs button');
        buttons.forEach(b => {
             if (b.dataset.tab === tab) b.classList.add('active');
             else b.classList.remove('active');
        });
        
        // Hide all content sections
        const contents = ['html', 'css', 'js', 'assets'];
        contents.forEach(t => {
            const el = document.getElementById('sidebar-content-' + t);
            if (el) el.style.display = 'none';
        });

        // Show active content
        const activeEl = document.getElementById('sidebar-content-' + tab);
        if (activeEl) {
            activeEl.style.display = 'flex';
        }
        
        if (tab === 'assets') this.loadAssets();
        if (tab === 'js') this.renderJSPanel();
    },

    loadAssets: async function() {
        const list = document.getElementById('asset-list');
        list.innerHTML = '<div style="color:#888; text-align:center;">Loading...</div>';
        
        try {
            const res = await fetch('/api/assets');
            if (!res.ok) throw new Error('Failed to fetch assets');
            
            const files = await res.json();
            
            // Folder System Logic (Visual Simulation)
            const folderMap = JSON.parse(localStorage.getItem('vuc_asset_folders') || '{}'); // filename -> folderName
            const folders = JSON.parse(localStorage.getItem('vuc_folders_list') || '["Images", "Icons", "Docs"]');
            
            list.innerHTML = '';
            list.style.display = 'block'; // Reset from grid
            
            // 1. Render Folders
            folders.forEach(folder => {
                const folderEl = document.createElement('div');
                folderEl.className = 'asset-folder';
                folderEl.innerHTML = `
                    <div class="folder-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <i class="fas fa-folder"></i> <span>${folder}</span> <i class="fas fa-chevron-down" style="font-size:0.7em; margin-left:auto;"></i>
                    </div>
                    <div class="folder-content hidden" data-folder="${folder}"></div>
                `;
                
                // Allow dropping into folder
                folderEl.ondragover = (e) => { e.preventDefault(); folderEl.classList.add('drag-over'); };
                folderEl.ondragleave = () => folderEl.classList.remove('drag-over');
                folderEl.ondrop = (e) => {
                    e.preventDefault();
                    folderEl.classList.remove('drag-over');
                    const fileName = e.dataTransfer.getData('text/plain');
                    if (fileName) {
                        folderMap[fileName] = folder;
                        localStorage.setItem('vuc_asset_folders', JSON.stringify(folderMap));
                        this.loadAssets(); // Reload to update view
                    }
                };
                
                list.appendChild(folderEl);
            });
            
            // 2. Render Files
            const uncategorizedEl = document.createElement('div');
            uncategorizedEl.className = 'asset-grid';
            uncategorizedEl.style.padding = '10px 0';
            
            if (files.length === 0) {
                uncategorizedEl.innerHTML = '<div style="color:#888; text-align:center; width:100%;">No assets found</div>';
            }
            
            files.forEach(f => {
                const item = document.createElement('div');
                item.className = 'asset-item';
                item.draggable = true;
                item.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', f.name);
                };
                
                item.innerHTML = `
                    <div class="asset-preview" style="background-image:url('${f.url}')"></div>
                    <div class="asset-name" title="${f.name}">${f.name}</div>
                `;
                
                item.onclick = () => {
                    const selected = Builder.selectedElement;
                    if (selected && selected.tagName === 'IMG') {
                        selected.src = f.url;
                        App.saveState();
                        App.updatePropertyInspector(selected);
                    } else {
                        navigator.clipboard.writeText(f.url);
                        App.showModal({ title: 'Success', message: 'Asset URL copied to clipboard!' });
                    }
                };

                // Place in folder or uncategorized
                const folderName = folderMap[f.name];
                if (folderName && folders.includes(folderName)) {
                    const folderContent = list.querySelector(`.folder-content[data-folder="${folderName}"]`);
                    if (folderContent) {
                        // Ensure grid layout in folder
                        if (!folderContent.classList.contains('asset-grid')) folderContent.classList.add('asset-grid');
                        folderContent.appendChild(item);
                        return;
                    }
                }
                
                uncategorizedEl.appendChild(item);
            });
            
            // Append uncategorized section if it has items
            if (uncategorizedEl.children.length > 0) {
                const header = document.createElement('div');
                header.className = 'category-header';
                header.innerText = 'Uncategorized';
                list.appendChild(header);
                list.appendChild(uncategorizedEl);
            }
            
        } catch (err) {
            console.error('Asset load error:', err);
            list.innerHTML = `<div style="color:red; text-align:center;">Error: ${err.message}</div>`;
        }
    },

    createAssetFolder: function() {
        this.showModal({
            title: 'New Folder',
            message: 'Enter folder name:',
            showInput: true,
            onOk: (name) => {
                if (name) {
                    const folders = JSON.parse(localStorage.getItem('vuc_folders_list') || '["Images", "Icons", "Docs"]');
                    if (!folders.includes(name)) {
                        folders.push(name);
                        localStorage.setItem('vuc_folders_list', JSON.stringify(folders));
                        this.loadAssets();
                    }
                }
            }
        });
    },

    loadProject: function() {
        const saved = localStorage.getItem('vuc_project');
        if (saved) {
            Builder.loadHTML(saved);
        } else {
            // Default content
            Builder.canvas.innerHTML = `
                <div class="dropped-element" style="padding: 40px; text-align: center; color: #555; border: 2px dashed #ccc; border-radius: 8px; margin: 20px;">
                    <h2 class="dropped-element">Welcome to Visual UI Code</h2>
                    <p class="dropped-element">Drag components from the left sidebar to start building.</p>
                    <button class="dropped-element btn" style="margin-top: 10px; padding: 8px 16px; background: #007acc; color: white; border: none; border-radius: 4px;">Example Button</button>
                </div>
            `;
        }
    },

    setupEventListeners: function() {
        // Sidebar Tabs
        document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (target && target.dataset.tab) {
                    this.switchSidebar(target.dataset.tab);
                }
            });
        });

        // Category Toggles
        document.querySelectorAll('.category-title').forEach(title => {
            title.addEventListener('click', (e) => {
                this.toggleCategory(e.currentTarget);
            });
        });

        // Toolbar
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        document.getElementById('btn-save').addEventListener('click', () => this.saveProject());
        document.getElementById('btn-export').addEventListener('click', () => this.exportProject());

        // Project Upload Input
        const projectUpload = document.getElementById('project-upload');
        if (projectUpload) {
            projectUpload.addEventListener('change', (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                // Simple heuristic to find main files
                let htmlFile, cssFile, jsFile;
                
                Array.from(files).forEach(f => {
                    const name = f.name.toLowerCase();
                    if (name.endsWith('.html') && (name.includes('index') || !htmlFile)) htmlFile = f;
                    if (name.endsWith('.css') && (name.includes('style') || !cssFile)) cssFile = f;
                    if ((name.endsWith('.js') || name.endsWith('.ts')) && (name.includes('script') || name.includes('main') || !jsFile)) jsFile = f;
                });

                if (htmlFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const content = ev.target.result;
                        // Strip html/body tags for the canvas if needed, or replace fully
                        // Current logic mostly assumes inner body content for canvas, 
                        // but let's try to load it into Monaco which syncs to canvas.
                        if (window.monacoEditor) {
                            window.monacoEditor.setValue(content);
                            // Trigger sync
                            this.syncCodeToCanvas();
                        }
                    };
                    reader.readAsText(htmlFile);
                }

                if (cssFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                         // We assume we have a way to set CSS. 
                         // Currently CSS is handled via style tags or the CSS tab in sidebar.
                         // Let's look for a CSS editor or store it.
                         // For now, let's inject it into the page or finding the CSS editor.
                         // Checking switchSidebar('css'), it shows #sidebar-content-css.
                         // We might need a Monaco instance for CSS too, but usually it's a textarea in this app?
                         // Let's check `updateCodeView` or similar.
                         // Assuming there is a CSS editor textarea or Monaco model.
                         // If not, we might need to add one or just alert the user.
                         // Actually, looking at previous reads, there is a `code-editor` textarea which syncs.
                         // But that's for HTML.
                         // Let's just log for now or put it in a style block if we can.
                         const cssContent = ev.target.result;
                         // Store it for export? Or try to put it in a <style id="custom-css">
                         let styleTag = document.getElementById('custom-css');
                         if (!styleTag) {
                             styleTag = document.createElement('style');
                             styleTag.id = 'custom-css';
                             document.head.appendChild(styleTag);
                         }
                         styleTag.textContent = cssContent;
                         this.logConsole('Loaded CSS file: ' + cssFile.name, 'success');
                    };
                    reader.readAsText(cssFile);
                }

                if (jsFile) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (window.scriptEditor) {
                            window.scriptEditor.setValue(ev.target.result);
                            this.logConsole('Loaded JS file: ' + jsFile.name, 'success');
                        }
                    };
                    reader.readAsText(jsFile);
                }
                
                this.logConsole(`Opened project with ${files.length} files.`, 'info');
            });
        }
        
        // Code Editor Live Sync
        document.getElementById('code-editor').addEventListener('input', () => this.syncCodeToCanvas());

        // Asset Upload
        const uploadInput = document.getElementById('asset-upload');
        if (uploadInput) {
            uploadInput.addEventListener('change', async (e) => {
                if (e.target.files.length > 0) {
                    const formData = new FormData();
                    formData.append('file', e.target.files[0]);
                    
                    try {
                        const res = await fetch('/api/assets', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await res.json();
                        if (data.success) {
                            App.loadAssets(); // Reload list
                            // Optional: Show success feedback
                        } else {
                            alert('Upload failed: ' + (data.error || 'Unknown error'));
                        }
                    } catch (err) {
                        console.error('Upload error:', err);
                        alert('Upload error: ' + err.message);
                    } finally {
                        e.target.value = ''; // Reset input to allow re-uploading same file
                    }
                }
            });
        }

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Check if user is typing in an input/textarea (except our main editor if it wasn't Monaco)
            if (e.target.tagName === 'INPUT' || (e.target.tagName === 'TEXTAREA' && e.target.id !== 'code-editor')) {
                return;
            }
            
            // Home: Ctrl+H
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                this.goHome();
            }
            // Timeline: Ctrl+T
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                this.toggleTimelinePanel();
            }

            // Custom Shortcuts
            if (e.altKey) {
                if (e.key === 'a') { e.preventDefault(); this.switchSidebar('html'); } // Add/Components
                if (e.key === '1' || e.key === 'h') { e.preventDefault(); this.switchSidebar('html'); }
                if (e.key === '2' || e.key === 'c') { e.preventDefault(); this.switchSidebar('css'); }
                if (e.key === '3' || e.key === 'j') { e.preventDefault(); this.switchSidebar('js'); }
            }

            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                this.redo();
            }
            // Save: Ctrl+S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveProject();
            }
            // Delete: Del or Backspace (only if element selected and not editing text)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                 // Make sure we aren't in code editor
                 if (document.activeElement === document.body || document.activeElement.classList.contains('preview-canvas')) {
                     if (Builder.selectedElement) {
                         e.preventDefault();
                         Builder.selectedElement.remove();
                         Builder.deselectElement();
                         this.saveState();
                     }
                 }
            }
        });

        // View modes
        document.getElementById('btn-desktop').addEventListener('click', () => this.setViewMode('desktop'));
        document.getElementById('btn-tablet').addEventListener('click', () => this.setViewMode('tablet'));
        document.getElementById('btn-mobile').addEventListener('click', () => this.setViewMode('mobile'));
        document.getElementById('btn-reset-layout').addEventListener('click', () => this.resetLayout());

        // Code Tabs
        const tabs = document.querySelectorAll('.code-tabs button');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelector('.code-tabs button.active').classList.remove('active');
                e.target.classList.add('active');
                this.updateCodeView(e.target.dataset.lang);
            });
        });
    },

    setViewMode: function(mode) {
        const canvas = document.getElementById('preview-canvas');
        canvas.className = 'preview-canvas ' + mode;
        document.getElementById('preview-size-label').innerText = mode.charAt(0).toUpperCase() + mode.slice(1);
    },

    createFlexBuilder: function(el) {
        const s = el.style;
        const container = document.createElement('div');
        container.className = 'flex-builder';
        
        // Helper to create a control row
        const createControl = (label, prop, options) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'flex-control';
            
            const lbl = document.createElement('label');
            lbl.innerText = label;
            wrapper.appendChild(lbl);
            
            const btnGroup = document.createElement('div');
            btnGroup.className = 'flex-options';
            
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'flex-btn' + (s[prop] === opt.value ? ' active' : '');
                btn.title = opt.value;
                btn.innerHTML = opt.icon; // FontAwesome icons
                
                btn.onclick = () => {
                    s[prop] = opt.value;
                    // Update UI
                    Array.from(btnGroup.children).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    App.updateCode();
                    App.saveState();
                };
                btnGroup.appendChild(btn);
            });
            
            wrapper.appendChild(btnGroup);
            return wrapper;
        };

        // Flex Direction
        container.appendChild(createControl('Direction', 'flexDirection', [
            { value: 'row', icon: '<i class="fas fa-arrow-right"></i>' },
            { value: 'column', icon: '<i class="fas fa-arrow-down"></i>' },
            { value: 'row-reverse', icon: '<i class="fas fa-arrow-left"></i>' },
            { value: 'column-reverse', icon: '<i class="fas fa-arrow-up"></i>' }
        ]));

        // Justify Content
        container.appendChild(createControl('Justify', 'justifyContent', [
            { value: 'flex-start', icon: '<i class="fas fa-align-left"></i>' },
            { value: 'center', icon: '<i class="fas fa-align-center"></i>' },
            { value: 'flex-end', icon: '<i class="fas fa-align-right"></i>' },
            { value: 'space-between', icon: '<i class="fas fa-arrows-alt-h"></i>' },
            { value: 'space-around', icon: '<i class="fas fa-compress-arrows-alt"></i>' }
        ]));

        // Align Items
        container.appendChild(createControl('Align', 'alignItems', [
            { value: 'stretch', icon: '<i class="fas fa-expand-alt"></i>' },
            { value: 'flex-start', icon: '<i class="fas fa-arrow-up"></i>' },
            { value: 'center', icon: '<i class="fas fa-align-center" style="transform:rotate(90deg)"></i>' },
            { value: 'flex-end', icon: '<i class="fas fa-arrow-down"></i>' }
        ]));
        
        // Wrap & Gap
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.marginBottom = '8px';
        
        // Wrap Toggle
        const wrapBtn = document.createElement('button');
        wrapBtn.className = 'flex-btn' + (s.flexWrap === 'wrap' ? ' active' : '');
        wrapBtn.innerHTML = '<i class="fas fa-level-down-alt"></i> Wrap';
        wrapBtn.style.flex = '1';
        wrapBtn.onclick = () => {
            if (s.flexWrap === 'wrap') {
                s.flexWrap = 'nowrap';
                wrapBtn.classList.remove('active');
            } else {
                s.flexWrap = 'wrap';
                wrapBtn.classList.add('active');
            }
            App.updateCode();
            App.saveState();
        };
        row.appendChild(wrapBtn);
        
        // Gap Input
        const gapInput = document.createElement('input');
        gapInput.className = 'prop-input';
        gapInput.placeholder = 'Gap (e.g. 10px)';
        gapInput.value = s.gap || '';
        gapInput.style.flex = '1';
        gapInput.onchange = (e) => {
            s.gap = e.target.value;
            App.updateCode();
            App.saveState();
        };
        row.appendChild(gapInput);
        
        container.appendChild(row);

        return container;
    },

    updatePropertyInspector: function(el) {
        const container = document.getElementById('property-inspector');
        container.innerHTML = '';

        if (!el) {
            container.innerHTML = '<div class="no-selection">Select an element to edit properties</div>';
            return;
        }

        // Highlight in Code View
        this.highlightCodeForElement(el);

        const createGroup = (title, inputs) => {
            const group = document.createElement('div');
            group.className = 'prop-group';
            group.innerHTML = `<div class="panel-header" style="padding-left:0; border:none; background:transparent; margin-bottom:5px;">${title}</div>`;
            inputs.forEach(input => group.appendChild(input));
            container.appendChild(group);
        };

        const createInput = (label, value, onChange, type='text', options=[]) => {
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '8px';
            
            const lbl = document.createElement('label');
            lbl.className = 'prop-label';
            lbl.innerText = label;
            
            let inp;
            if (type === 'select') {
                inp = document.createElement('select');
                inp.className = 'prop-input';
                options.forEach(opt => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.innerText = opt;
                    if (opt === value) o.selected = true;
                    inp.appendChild(o);
                });
            } else if (type === 'color') {
                const colorWrap = document.createElement('div');
                colorWrap.style.display = 'flex';
                
                inp = document.createElement('input');
                inp.className = 'prop-input';
                inp.type = 'text';
                inp.value = value || '';
                inp.style.flex = '1';
                
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = value && value.startsWith('#') ? value : '#000000';
                picker.style.width = '30px';
                picker.style.height = '30px';
                picker.style.border = 'none';
                picker.style.padding = '0';
                picker.style.marginLeft = '5px';
                picker.style.cursor = 'pointer';
                
                picker.oninput = (e) => {
                    inp.value = e.target.value;
                    inp.dispatchEvent(new Event('input'));
                };
                
                colorWrap.appendChild(inp);
                colorWrap.appendChild(picker);
                wrapper.appendChild(lbl);
                wrapper.appendChild(colorWrap);

                // Palette Swatches
                const swatchRow = document.createElement('div');
                swatchRow.style.display = 'flex';
                swatchRow.style.flexWrap = 'wrap';
                swatchRow.style.gap = '4px';
                swatchRow.style.marginTop = '4px';
                
                const manageBtn = document.createElement('button');
                manageBtn.innerHTML = '<i class="fas fa-palette"></i>';
                manageBtn.title = "Manage Palette";
                manageBtn.style.border = 'none';
                manageBtn.style.background = 'transparent';
                manageBtn.style.color = '#888';
                manageBtn.style.cursor = 'pointer';
                manageBtn.style.fontSize = '12px';
                manageBtn.onclick = () => this.openColorPaletteManager();
                swatchRow.appendChild(manageBtn);

                this.projectColors.forEach(c => {
                    const s = document.createElement('div');
                    s.style.width = '16px';
                    s.style.height = '16px';
                    s.style.backgroundColor = c;
                    s.style.cursor = 'pointer';
                    s.style.border = '1px solid #444';
                    s.title = c;
                    s.onclick = () => {
                        inp.value = c;
                        picker.value = c; 
                        inp.dispatchEvent(new Event('input')); 
                    };
                    swatchRow.appendChild(s);
                });
                wrapper.appendChild(swatchRow);
                
                const update = (e) => { onChange(e.target.value); this.updateCode(); };
                inp.onchange = (e) => { update(e); this.saveState(); };
                inp.oninput = update;
                return wrapper;
            } else {
                inp = document.createElement('input');
                inp.className = 'prop-input';
                inp.type = type;
                inp.value = value || '';
            }
            
            const update = (e) => {
                onChange(e.target.value);
                this.updateCode(); 
            };
            
            inp.onchange = (e) => { update(e); this.saveState(); };
            inp.oninput = update;

            wrapper.appendChild(lbl);
            wrapper.appendChild(inp);
            return wrapper;
        };

        // Identity
        createGroup('Identity', [
            createInput('ID', el.id, (v) => el.id = v),
            createInput('Classes', el.className.replace('dropped-element', '').replace('selected', '').trim(), (v) => {
                el.className = 'dropped-element selected ' + v;
            })
        ]);

        // Actions
        const actionGroup = document.createElement('div');
        actionGroup.className = 'prop-group';
        actionGroup.innerHTML = `<div class="panel-header" style="padding-left:0; border:none; background:transparent; margin-bottom:5px;">Actions</div>`;
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn primary';
        saveBtn.style.width = '100%';
        saveBtn.innerHTML = '<i class="fas fa-cube"></i> Save as Block';
        saveBtn.onclick = () => this.saveCurrentBlock();
        
        actionGroup.appendChild(saveBtn);
        container.appendChild(actionGroup);
        
        // Content
        if (!['input', 'img', 'hr', 'br', 'video', 'audio', 'iframe'].includes(el.tagName.toLowerCase())) {
             createGroup('Content', [
                createInput('Text', el.innerText, (v) => el.innerText = v)
            ]);
        }
        
        if (el.tagName.toLowerCase() === 'img') {
            createGroup('Image Source', [
                createInput('Src', el.getAttribute('src'), (v) => el.setAttribute('src', v)),
                createInput('Alt', el.getAttribute('alt'), (v) => el.setAttribute('alt', v))
            ]);
        }
        
        if (el.tagName.toLowerCase() === 'a') {
            createGroup('Link', [
                createInput('Href', el.getAttribute('href'), (v) => el.setAttribute('href', v)),
                createInput('Target', el.getAttribute('target'), (v) => el.setAttribute('target', v), 'select', ['_self', '_blank', '_parent', '_top'])
            ]);
        }

        // Styles
        const s = el.style;
        createGroup('Layout', [
            createInput('Width', s.width, (v) => s.width = v),
            createInput('Height', s.height, (v) => s.height = v),
            createInput('Padding', s.padding, (v) => s.padding = v),
            createInput('Margin', s.margin, (v) => s.margin = v),
            createInput('Display', s.display, (v) => {
                s.display = v;
                // Re-render to show/hide flex controls
                this.updatePropertyInspector(el);
            }, 'select', ['block', 'inline-block', 'flex', 'grid', 'none']),
        ]);

        // Flexbox Visual Builder
        if (s.display === 'flex') {
            const flexGroup = document.createElement('div');
            flexGroup.className = 'prop-group';
            flexGroup.innerHTML = `<div class="panel-header" style="padding-left:0; border:none; background:transparent; margin-bottom:5px;">Flexbox</div>`;
            flexGroup.appendChild(this.createFlexBuilder(el));
            container.appendChild(flexGroup);
        }

        createGroup('Typography', [
            createInput('Color', s.color, (v) => s.color = v, 'color'),
            createInput('Font Family', s.fontFamily, (v) => s.fontFamily = v, 'select', ['Arial, sans-serif', 'Helvetica, sans-serif', 'Times New Roman, serif', 'Courier New, monospace', 'Georgia, serif', 'Verdana, sans-serif', 'system-ui, -apple-system, sans-serif']),
            createInput('Font Size', s.fontSize, (v) => s.fontSize = v),
            createInput('Font Weight', s.fontWeight, (v) => s.fontWeight = v, 'select', ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']),
            createInput('Line Height', s.lineHeight, (v) => s.lineHeight = v),
            createInput('Letter Spacing', s.letterSpacing, (v) => s.letterSpacing = v),
            createInput('Text Align', s.textAlign, (v) => s.textAlign = v, 'select', ['left', 'center', 'right', 'justify']),
            createInput('Decoration', s.textDecoration, (v) => s.textDecoration = v, 'select', ['none', 'underline', 'overline', 'line-through']),
            createInput('Transform', s.textTransform, (v) => s.textTransform = v, 'select', ['none', 'capitalize', 'uppercase', 'lowercase'])
        ]);

        createGroup('Appearance', [
            createInput('Background', s.backgroundColor, (v) => s.backgroundColor = v, 'color'),
            createInput('Opacity', s.opacity, (v) => s.opacity = v),
            createInput('Cursor', s.cursor, (v) => s.cursor = v, 'select', ['default', 'pointer', 'text', 'move', 'not-allowed']),
            createInput('Box Shadow', s.boxShadow, (v) => s.boxShadow = v),
            createInput('Border', s.border, (v) => s.border = v),
            createInput('Border Radius', s.borderRadius, (v) => s.borderRadius = v),
            createInput('Overflow', s.overflow, (v) => s.overflow = v, 'select', ['visible', 'hidden', 'scroll', 'auto'])
        ]);

        createGroup('Effects & Transforms', [
            createInput('Rotate (deg)', '', (v) => {
                // Parse existing transform or append
                // This is a simplified approach; a real transform manager would be complex
                // For now, let's just support simple rotation
                s.transform = `rotate(${v}deg)`;
            }),
            createInput('Scale', '', (v) => s.transform = `scale(${v})`),
            createInput('Filter', s.filter, (v) => s.filter = v, 'text'), // e.g. blur(5px)
            createInput('Transition', s.transition, (v) => s.transition = v)
        ]);
        
        this.renderJSPanel();
    },

    renderJSPanel: function() {
        const container = document.getElementById('js-panel-content');
        if (!container) return;
        
        const el = Builder.selectedElement;
        
        if (!el) {
            container.innerHTML = '<div class="no-selection">Select an element to manage events</div>';
            return;
        }

        container.innerHTML = '';
        
        // Header info
        const info = document.createElement('div');
        info.style.marginBottom = '15px';
        info.style.padding = '10px';
        info.style.background = '#252526';
        info.style.borderRadius = '4px';
        info.innerHTML = `<strong>${el.tagName.toLowerCase()}</strong>${el.id ? ' #' + el.id : ''}`;
        container.appendChild(info);
        
        // Event List
        const events = ['click', 'dblclick', 'mousedown', 'mouseup', 'mouseover', 'mouseout', 'change', 'input', 'submit', 'keydown', 'keyup'];
        
        events.forEach(evt => {
            const wrapper = document.createElement('div');
            wrapper.className = 'js-event-item';
            wrapper.style.marginBottom = '10px';
            wrapper.style.border = '1px solid #333';
            wrapper.style.borderRadius = '4px';
            wrapper.style.overflow = 'hidden';
            
            // Header
            const header = document.createElement('div');
            header.style.padding = '8px 10px';
            header.style.background = '#333';
            header.style.cursor = 'pointer';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            
            const hasEvent = el.hasAttribute('on' + evt);
            
            header.innerHTML = `
                <span>on${evt}</span>
                <i class="fas fa-chevron-down" style="font-size:0.8em; transform:${hasEvent ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
            `;
            
            // Content
            const content = document.createElement('div');
            content.style.display = hasEvent ? 'block' : 'none';
            content.style.padding = '10px';
            content.style.background = '#1e1e1e';
            
            const textarea = document.createElement('textarea');
            textarea.className = 'prop-input'; // Reuse style
            textarea.style.width = '100%';
            textarea.style.minHeight = '60px';
            textarea.style.fontFamily = 'monospace';
            textarea.placeholder = `// Code for on${evt}...`;
            textarea.value = el.getAttribute('on' + evt) || '';
            
            textarea.addEventListener('change', (e) => {
                const val = e.target.value.trim();
                if (val) {
                    el.setAttribute('on' + evt, val);
                } else {
                    el.removeAttribute('on' + evt);
                }
                App.updateCode();
                App.saveState();
                
                // Update header icon
                const icon = header.querySelector('.fa-chevron-down');
                if (icon) icon.style.transform = 'rotate(180deg)';
            });
            
            content.appendChild(textarea);
            
            // Toggle
            header.onclick = () => {
                const isVisible = content.style.display === 'block';
                content.style.display = isVisible ? 'none' : 'block';
                const icon = header.querySelector('.fa-chevron-down');
                if (icon) icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            };
            
            wrapper.appendChild(header);
            wrapper.appendChild(content);
            container.appendChild(wrapper);
        });
    },

    updateCode: function() {
        const activeBtn = document.querySelector('.code-tabs button.active');
        if (!activeBtn) return;
        const activeTab = activeBtn.dataset.lang;
        this.updateCodeView(activeTab);
    },

    syncCodeToCanvas: function() {
        // Use Monaco if available
        let code;
        if (window.monacoEditor) {
            code = window.monacoEditor.getValue();
        } else {
            const editor = document.getElementById('code-editor');
            if (!editor) return;
            code = editor.value;
        }

        const activeBtn = document.querySelector('.code-tabs button.active');
        if (!activeBtn) return;
        const activeTab = activeBtn.dataset.lang;
        
        if (activeTab === 'html') {
            // Extract body content if wrapped in <html><body>...</body></html>
            let bodyContent = code;
            if (code.includes('<body')) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(code, 'text/html');
                bodyContent = doc.body.innerHTML;
            }
            
            Builder.loadHTML(bodyContent);
            
            // Debounce save
            this.saveStateDebounced();
        } else if (activeTab === 'js') {
             // Handle Global JS
             let scriptEl = Builder.canvas.querySelector('#custom-global-js');
             if (!scriptEl) {
                 scriptEl = document.createElement('script');
                 scriptEl.id = 'custom-global-js';
                 Builder.canvas.appendChild(scriptEl);
             }
             scriptEl.innerText = code;
             this.saveStateDebounced();
        }
    },

    updateCodeView: function(lang) {
        if (!window.monacoEditor) return;
        
        const model = window.monacoEditor.getModel();
        monaco.editor.setModelLanguage(model, lang === 'js' ? 'javascript' : lang);

        if (lang === 'html') {
            let html = Builder.getHTML();
            let fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>My Project</title>
<style>body { font-family: sans-serif; }</style>
</head>
<body>
${html}
</body>
</html>`;
            
            // Set flag to prevent loop
            this.isUpdatingCode = true;
            try {
                const formatted = this.formatHTML(fullHtml);
                const currentVal = window.monacoEditor.getValue();
                
                // Only update if changed to avoid cursor jumping if possible (though setValue resets cursor usually)
                if (formatted !== currentVal) {
                    window.monacoEditor.setValue(formatted);
                    this.showSyncFeedback();
                }
            } finally {
                this.isUpdatingCode = false;
            }

        } else if (lang === 'css') {
            window.monacoEditor.setValue("/* Styles are currently inline in HTML. \n   Export to extract to CSS. */");
        } else if (lang === 'js') {
            const scriptEl = Builder.canvas.querySelector('#custom-global-js');
            const val = scriptEl ? scriptEl.innerText : "// Custom JavaScript\n// Code here will run globally";
            window.monacoEditor.setValue(val);
        }
    },

    formatHTML: function(html) {
        let formatted = '';
        let pad = 0;
        
        // Fix: Strip leading/trailing brackets if present to avoid duplication
        // The split(/>\s*</) method assumes we are splitting 'between' tags,
        // so it re-adds brackets to everything. 
        // We need to ensure the first and last tags don't have their outer brackets 
        // before splitting, otherwise they get double brackets.
        html = html.trim();
        if (html.startsWith('<')) html = html.substring(1);
        if (html.endsWith('>')) html = html.substring(0, html.length - 1);
        
        html.split(/>\s*</).forEach(function(node) {
            if (node.match( /^\/\w/ )) pad -= 1;
            formatted += new Array(pad + 1).join('  ') + '<' + node + '>\r\n';
            if (node.match( /^<?\w[^>]*[^\/]$/ ) && !node.startsWith('input') && !node.startsWith('img') && !node.startsWith('br') && !node.startsWith('!DOCTYPE')) pad += 1;
        });
        return formatted.trim();
    },

    // History / Undo / Redo
    saveState: function() {
        // Debounce if needed, but for now simple
        const currentHTML = Builder.getHTML();
        
        // If same as current state, skip
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === currentHTML) return;

        // Truncate future history if we were in the middle
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        this.history.push(currentHTML);
        if (this.history.length > this.maxHistory) this.history.shift();
        else this.historyIndex++;
        
        this.updateUndoRedoButtons();
    },
    
    // Call this when dragging stops or input blurs
    saveStateDebounced: function() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveState(), 500);
    },

    undo: function() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            Builder.loadHTML(this.history[this.historyIndex]);
            this.updateCode();
            this.updateUndoRedoButtons();
            Builder.deselectElement();
        }
    },

    redo: function() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            Builder.loadHTML(this.history[this.historyIndex]);
            this.updateCode();
            this.updateUndoRedoButtons();
            Builder.deselectElement();
        }
    },

    updateUndoRedoButtons: function() {
        document.getElementById('btn-undo').disabled = this.historyIndex <= 0;
        document.getElementById('btn-redo').disabled = this.historyIndex >= this.history.length - 1;
        document.getElementById('btn-undo').style.opacity = this.historyIndex <= 0 ? 0.5 : 1;
        document.getElementById('btn-redo').style.opacity = this.historyIndex >= this.history.length - 1 ? 0.5 : 1;
    },

    // Terminal
    setupTerminal: function() {
        const input = document.getElementById('terminal-input');
        const output = document.getElementById('terminal-output');
        const btn = document.getElementById('btn-run-cmd');

        if (!input || !output || !btn) return;

        const execute = async () => {
            const cmd = input.value.trim();
            if (!cmd) return;

            // Echo command
            output.innerHTML += `<div class="terminal-line"><span style="color:#007acc">$</span> ${cmd}</div>`;
            input.value = '';
            
            // Scroll to bottom
            output.scrollTop = output.scrollHeight;

            try {
                const response = await fetch('/api/run_command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: cmd })
                });
                
                const data = await response.json();
                
                if (data.stdout) {
                    output.innerHTML += `<div class="terminal-line">${data.stdout}</div>`;
                }
                if (data.stderr) {
                    output.innerHTML += `<div class="terminal-line" style="color:red">${data.stderr}</div>`;
                }
                if (data.error) {
                    output.innerHTML += `<div class="terminal-line" style="color:red">Error: ${data.error}</div>`;
                }
            } catch (err) {
                output.innerHTML += `<div class="terminal-line" style="color:red">Network Error: ${err.message}</div>`;
            }
            output.scrollTop = output.scrollHeight;
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') execute();
        });
        
        btn.addEventListener('click', execute);
    },

    saveProject: async function() {
        // Save to local storage for now, or backend if needed
        const html = Builder.getHTML();
        localStorage.setItem('vuc_project', html);
        alert('Project saved to local storage!');
    },

    exportProject: function() {
        const html = Builder.getHTML();
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Project</title>
    <style>body { font-family: sans-serif; }</style>
</head>
<body>
${html}
</body>
</html>`;
        
        const blob = new Blob([fullHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

window.onload = () => App.init();
window.App = App;
