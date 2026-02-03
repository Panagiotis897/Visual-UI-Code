const Builder = {
    selectedElement: null,
    draggedType: null,
    canvas: null,

    init: function() {
        this.canvas = document.getElementById('preview-canvas');
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
            if (target === this.canvas || target.closest('.preview-canvas')) {
                // If dropped on an existing element in canvas, append to it if it's a container
                // Otherwise append to parent or canvas
                if (!target.classList.contains('preview-canvas') && !this.isContainer(target)) {
                    target = target.parentElement;
                }
            } else {
                target = this.canvas;
            }

            const type = e.dataTransfer.getData('text/plain');
            if (type) {
                this.createElement(type, target);
                // Trigger code update
                if (window.App) window.App.updateCode();
            }
        });
    },

    setupCanvasInteractions: function() {
        this.canvas.addEventListener('click', (e) => {
            // Prevent triggering if clicking on canvas background (unless we want to deselect)
            if (e.target === this.canvas) {
                this.deselectElement();
                return;
            }
            
            // Find the closest selectable element
            // We assume all direct children or nested children created by builder are selectable
            // We can mark them with a class or just check if they are inside canvas
            e.stopPropagation();
            this.selectElement(e.target);
        });
    },

    isContainer: function(element) {
        // Define which tags can contain other elements
        const voidTags = ['img', 'input', 'hr', 'br'];
        return !voidTags.includes(element.tagName.toLowerCase());
    },

    highlightDropTarget: function(target) {
        if (target === this.canvas) {
            target.style.outline = '2px dashed #007acc';
        } else {
            target.style.outline = '2px dashed #007acc';
            // Stop propagation of highlight if nested? 
            // Actually CSS hover might be better, but for DnD we need JS
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

    selectElement: function(el) {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('selected');
        }
        this.selectedElement = el;
        el.classList.add('selected');
        
        // Update Property Inspector
        if (window.App) window.App.updatePropertyInspector(el);
    },

    deselectElement: function() {
        if (this.selectedElement) {
            this.selectedElement.classList.remove('selected');
            this.selectedElement = null;
        }
        if (window.App) window.App.updatePropertyInspector(null);
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
    }
};
