# Visual UI Code

![Status](https://img.shields.io/badge/Status-Active-success)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

A comprehensive, web-based integrated development environment (IDE) for visual UI building. Visual UI Code bridges the gap between drag-and-drop design and code-level control, featuring a 3-panel layout with real-time bi-directional synchronization, a responsive preview, and a built-in terminal.

---

## 🚀 Features

### **Visual Builder & Design**
- **Drag-and-Drop Interface**: Intuitively build layouts by dragging components (Containers, Inputs, Media) from the sidebar.
- **Real-Time Preview**: Instantly see your changes on a live canvas.
- **Responsive Design Modes**: Toggle between Desktop, Tablet, and Mobile views to ensure your UI works on all devices.
- **Design System Panel**: Built-in reference for color palettes, typography scales, and spacing guidelines.
- **Color Studio**: Advanced color picker and management.

### **Code & Development**
- **Monaco Editor Integration**: Professional-grade code editing with syntax highlighting (powered by VS Code's editor engine).
- **Bi-Directional Sync**: Changes in the visual builder update the code, and edits in the code editor update the visual preview.
- **Built-in Terminal**: Execute shell commands directly from the browser interface (powered by a Python/Flask backend).
- **Structure Tree**: Navigate and manipulate the DOM structure of your project.

### **Productivity Tools**
- **Project Hub**: Manage multiple projects and easily switch between them.
- **Property Inspector**: Granular control over element attributes (ID, classes, text content, styles).
- **Asset Management**: Upload and manage project assets (images, media) directly within the IDE.
- **Undo/Redo History**: Fearlessly experiment with full state management support.
- **Local Persistence**: Your work is automatically saved to local storage, so you never lose progress.
- **Export**: Download your project as a clean, standalone HTML file.

---

## 🛠️ Installation & Getting Started

### Prerequisites
- **Python 3.7+**
- **pip** (Python package manager)

### Setup
1.  **Clone the repository** (or download source):
    ```bash
    git clone https://github.com/Panagiotis897/Visual-UI-Code.git
    cd Visual-UI-Code
    ```

2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run the application**:
    ```bash
    python app.py
    ```

4.  **Access the IDE**:
    Open your browser and navigate to `http://localhost:5000`.

---

## ⚠️ Security Note
This application includes a terminal feature that allows executing shell commands from the browser. **This is intended for local development only.** Do not deploy this application to a public server without implementing proper authentication and security measures, as it could allow remote code execution.

---

## 📖 User Manual

### Interface Overview
| Section | Description |
| :--- | :--- |
| **Sidebar (Left)** | Contains tabs for **HTML** (Components), **CSS** (Design), **JS**, and **Project Files**. Also houses the **Property Inspector**. |
| **Code Panel (Center)** | The Monaco Editor for direct code manipulation and the integrated **Terminal**. |
| **Preview Panel (Right)** | The live canvas where you drop elements. Includes a toolbar for responsive testing. |

### Workflow
1.  **Create/Open Project**: Use the Project Hub to start a new project or open an existing one.
2.  **Drag & Drop**: Drag a component (e.g., `Button`, `Div`, `Image`) onto the preview canvas.
3.  **Customize**: Click the element on the canvas to select it. Use the **Property Inspector** at the bottom left to change its text, color, or classes.
4.  **Refine Code**: Switch to the center panel to fine-tune the generated HTML/CSS.
5.  **Save & Export**: Use the top toolbar to save your progress or export the final `project.html`.

---

## 💻 Technologies Used

- **Frontend**: HTML5, CSS3 (Modern Variables, Flexbox/Grid), JavaScript (ES6+), Monaco Editor.
- **Backend**: Python, Flask.
- **Utilities**: Mobile Drag-Drop Polyfill (for touch support), FontAwesome (Icons).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

*Built with ❤️ for visual developers.*
