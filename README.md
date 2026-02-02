# Visual UI Code

A comprehensive web-based visual UI coding application that provides an integrated development environment with drag-and-drop capabilities, real-time code generation, and Python backend integration.

## Features

- **Visual Interface Builder**: Drag-and-drop components from the sidebar to the canvas.
- **Three-Panel Layout**: 
  - **Sidebar**: Component library and Property Inspector.
  - **Center**: Code Editor (HTML/CSS/JS) and Terminal.
  - **Right**: Live Preview Canvas with responsive modes (Desktop, Tablet, Mobile).
- **Real-time Code Generation**: Changes in the visual builder are immediately reflected in the code editor.
- **Property Inspector**: Edit properties (Layout, Typography, Colors, etc.) of selected elements.
- **Terminal Integration**: Run shell commands directly from the interface (powered by Python/Flask).
- **Save & Export**: Save projects to local storage or export as a standalone HTML file.
- **Undo/Redo**: Full history support for design changes.

## Installation

1.  **Prerequisites**:
    *   Python 3.7+
    *   pip (Python package manager)

2.  **Setup**:
    ```bash
    cd "Visual UI Code"
    pip install -r requirements.txt
    ```

3.  **Run**:
    ```bash
    python app.py
    ```

4.  **Access**:
    Open your browser and navigate to `http://localhost:5000`.

## User Manual

### Interface Overview
- **Toolbar**: Contains Undo/Redo, View Mode toggles (Desktop/Tablet/Mobile), Save, and Export buttons.
- **Component Sidebar**: Drag elements (Div, Button, Image, etc.) from here to the Preview Canvas.
- **Property Inspector**: Select an element in the canvas to view and edit its properties in the bottom-left panel.
- **Code Editor**: View the generated HTML code. You can also edit code here (note: two-way binding is currently one-way from Visual -> Code).
- **Terminal**: Type commands in the input field at the bottom center to execute them on the server.

### How to Use
1.  **Add Elements**: Drag a component from the sidebar and drop it onto the white canvas area.
2.  **Select Elements**: Click on any element in the canvas to select it. A blue border will appear.
3.  **Edit Properties**: With an element selected, use the Property Inspector to change text, colors, margin, padding, etc.
4.  **Structure**: You can drop elements inside other container elements (like Divs or Sections) to build complex layouts.
5.  **Preview**: Use the device icons in the top toolbar to see how your layout looks on different screen sizes.
6.  **Export**: Click "Export" to download a `project.html` file containing your design.

## Technical Details
- **Frontend**: HTML5, CSS3, JavaScript (ES6+).
- **Backend**: Flask (Python) for serving files and executing terminal commands.
- **Storage**: Uses Browser LocalStorage for quick saves.

## Testing
Run the test suite:
```bash
python -m unittest discover tests
```
