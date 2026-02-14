const Builder = {
    selectedElements: [],
    draggedType: null,
    canvas: null,

    init: function() {
        this.canvas = document.getElementById('preview-canvas');
        if (!this.canvas) {
            console.error('Builder: Preview canvas not found');
            return;
        }
        this.setupDragAndDrop();
        this.setupCanvasInteractions();
        this.setupTooltip();
    },

    setupTooltip: function() {
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'builder-tooltip';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
        this.tooltip = tooltip;

        // Mouse move handler
        this.canvas.addEventListener('mousemove', (e) => {
            const target = e.target;
            
            // Don't show for canvas itself
            if (target === this.canvas || target.classList.contains('preview-canvas')) {
                tooltip.style.display = 'none';
                return;
            }

            // Get info
            const tagName = target.tagName.toLowerCase();
            const id = target.id;
            const classes = Array.from(target.classList)
                .filter(c => c !== 'dropped-element' && c !== 'selected')
                .join('.');
                
            // Build Content
            let content = `<span class="tag">${tagName}</span>`;
            
            // Only show ID if it has a value
            if (id && id.trim() !== '') {
                content += `<span class="id">#${id}</span>`;
            }
            
            // Always show classes if they exist
            if (classes) {
                content += `<span class="class">.${classes}</span>`;
            }
            
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';

            // Positioning
            const offset = 20; // Distance from cursor
            let left = e.clientX;
            let top = e.clientY - offset - tooltip.offsetHeight; // Position above cursor

            // Boundary checks
            // 1. Top boundary: if tooltip goes above viewport, move it below cursor
            if (top < 0) {
                top = e.clientY + offset; 
            }
            
            // 2. Right boundary: if tooltip goes off-screen right, shift left
            if (left + tooltip.offsetWidth > window.innerWidth) {
                left = window.innerWidth - tooltip.offsetWidth - 10;
            }
            
            // 3. Left boundary: ensure it doesn't go off-screen left
            if (left < 0) {
                left = 10;
            }

            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';
        });

        // Hide on leave
        this.canvas.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    },

    setupDragAndDrop: function() {
        // Sidebar draggable items
        const draggables = document.querySelectorAll('.draggable-item');
        draggables.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                // Use 'item' or 'e.currentTarget' to ensure we get the data-type from the container
                // even if the user dragged a child icon/text
                this.draggedType = item.dataset.type; 
                e.dataTransfer.setData('text/plain', this.draggedType);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });

        // Canvas drop zone
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.highlightDropTarget(e.target);
        });

        this.canvas.addEventListener('dragleave', (e) => {
            this.removeHighlight(e.target);
        });

        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.removeHighlight(e.target);
            
            // Determine drop target (canvas or nested element)
            let target = e.target;
            
            // If dropped on an existing element in canvas
            if (target !== this.canvas && !target.classList.contains('preview-canvas')) {
                // If it's not a container, go to parent
                if (!this.isContainer(target)) {
                    target = target.parentElement;
                }
            } else {
                target = this.canvas;
            }
            
            // Check if we have a selected container and we dropped on the canvas (not specifically on another element)
            // The user asked: "Divs must be draggable onto the code or onto selected objects."
            // If I drop "loosely" on the canvas, but I have a container selected, maybe it should go there?
            // Standard behavior is usually "drop where you point". 
            // However, let's respect the "onto selected objects" if the drop target is the generic canvas 
            // and we have exactly one container selected.
            if ((target === this.canvas || target.classList.contains('preview-canvas')) && 
                this.selectedElements.length === 1 && 
                this.isContainer(this.selectedElements[0])) {
                target = this.selectedElements[0];
            }

            const type = e.dataTransfer.getData('text/plain');
            // Handle color drop
            if (type.startsWith('color:')) {
                const color = type.split(':')[1];
                if (target !== this.canvas) {
                    target.style.backgroundColor = color;
                    if (window.App) window.App.saveState();
                }
                return;
            }

            if (type === 'saved-block') {
                const blockId = e.dataTransfer.getData('application/vuc-block-id');
                this.createSavedBlock(blockId, target);
                if (window.App) window.App.updateCode();
            } else if (type) {
                this.createElement(type, target);
                if (window.App) window.App.updateCode();
            }
        });
    },

    createSavedBlock: function(blockId, parent) {
        if (!window.App || !window.App.savedBlocks) return;
        
        const block = window.App.savedBlocks.find(b => b.id === blockId);
        if (!block) return;
        
        // Create a temporary container to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = block.html;
        
        Array.from(temp.children).forEach(child => {
            const clone = child.cloneNode(true);
            
            // Recursive class adder
            const addClasses = (el) => {
                el.classList.add('dropped-element');
                // Remove 'selected' if it was saved as selected
                el.classList.remove('selected');
                
                // If it doesn't have an ID, give it one
                if (!el.id) el.id = 'saved-' + Math.random().toString(36).substr(2, 9);
                
                Array.from(el.children).forEach(addClasses);
            };
            addClasses(clone);
            
            parent.appendChild(clone);
            this.selectElement(clone);
        });
        
        if (window.App) window.App.saveState();
    },

    setupCanvasInteractions: function() {
        this.canvas.addEventListener('click', (e) => {
            // Prevent triggering if clicking on canvas background (unless we want to deselect)
            if (e.target === this.canvas || e.target.classList.contains('preview-canvas')) {
                this.deselectAll();
                return;
            }
            
            e.stopPropagation();
            
            // Multi-select with Ctrl or Meta (Cmd)
            const multi = e.ctrlKey || e.metaKey;
            this.selectElement(e.target, multi);
        });
    },

    isContainer: function(element) {
        // Define which tags can contain other elements
        const voidTags = ['img', 'input', 'hr', 'br', 'meta', 'link'];
        return !voidTags.includes(element.tagName.toLowerCase());
    },

    highlightDropTarget: function(target) {
        if (target === this.canvas) {
            target.style.outline = '2px dashed #007acc';
        } else {
            target.style.outline = '2px dashed #007acc';
        }
    },

    removeHighlight: function(target) {
        target.style.outline = '';
    },

    createElement: function(type, parent) {
        if (!type || !ComponentDefinitions[type]) {
            console.warn('Invalid component type:', type);
            return;
        }

        const def = ComponentDefinitions[type];
        
        // Ensure we are creating the correct tag
        const el = document.createElement(def.tag);
        
        // Add default classes
        el.classList.add('dropped-element');
        if (def.attributes.class) {
             const classes = def.attributes.class.split(' ');
             classes.forEach(c => { if(c) el.classList.add(c); });
        }

        // Add default styles
        Object.assign(el.style, def.defaultStyles);

        // Add attributes
        for (const [key, value] of Object.entries(def.attributes)) {
            if (key !== 'class') {
                el.setAttribute(key, value);
            }
        }

        // Add content
        if (!def.isVoid && def.defaultContent) {
            el.innerText = def.defaultContent;
        }

        // Generate a unique ID
        const id = type + '-' + Math.random().toString(36).substr(2, 9);
        el.id = id;

        // Append to parent
        parent.appendChild(el);
        this.selectElement(el);
        
        // Add to history (Undo/Redo) - handled by App
        if (window.App) window.App.saveState();
    },

    selectElement: function(el, multi = false) {
        if (!multi) {
            this.deselectAll();
        }

        if (this.selectedElements.includes(el)) {
            // If already selected and multi, toggle off
            if (multi) {
                el.classList.remove('selected');
                this.selectedElements = this.selectedElements.filter(e => e !== el);
                // Update Inspector
                if (window.App) {
                     if (this.selectedElements.length === 1) {
                         window.App.updatePropertyInspector(this.selectedElements[0]);
                     } else if (this.selectedElements.length > 1) {
                         window.App.updatePropertyInspector(null, this.selectedElements.length);
                     } else {
                         window.App.updatePropertyInspector(null);
                     }
                }
                return;
            }
            // If single select and already selected, do nothing (keep selected)
        } else {
            this.selectedElements.push(el);
            el.classList.add('selected');
        }
        
        // Update Property Inspector
        if (window.App) {
            if (this.selectedElements.length === 1) {
                window.App.updatePropertyInspector(this.selectedElements[0]);
            } else {
                window.App.updatePropertyInspector(null, this.selectedElements.length);
            }
        }
    },

    deselectAll: function() {
        this.selectedElements.forEach(el => el.classList.remove('selected'));
        this.selectedElements = [];
        if (window.App) window.App.updatePropertyInspector(null);
    },
    
    // Select all elements in the canvas
    selectAll: function() {
        const all = this.canvas.querySelectorAll('.dropped-element');
        this.deselectAll(); // Clear first
        all.forEach(el => {
            el.classList.add('selected');
            this.selectedElements.push(el);
        });
        if (window.App) window.App.updatePropertyInspector(null, this.selectedElements.length);
    },

    // Helper to get current DOM as string
    getHTML: function() {
        // Clone canvas to clean up class names (remove .dropped-element, .selected)
        const clone = this.canvas.cloneNode(true);
        
        // Clean up
        const cleanElements = (element) => {
            if (element.classList) {
                element.classList.remove('dropped-element');
                element.classList.remove('selected');
                element.style.outline = ''; // Remove drag highlights
                if (element.classList.length === 0) {
                    element.removeAttribute('class');
                }
            }
            Array.from(element.children).forEach(cleanElements);
        };
        
        Array.from(clone.children).forEach(cleanElements);
        
        return clone.innerHTML;
    },
    
    // Load from HTML string (for undo/redo or load)
    loadHTML: function(html) {
        this.canvas.innerHTML = html;
        // Re-attach listeners or add classes? 
        // The classes 'dropped-element' are needed for interactions
        const rehydrate = (element) => {
            element.classList.add('dropped-element');
            Array.from(element.children).forEach(rehydrate);
        };
        Array.from(this.canvas.children).forEach(rehydrate);
        this.selectedElements = []; // Clear selection on load
    }
};
