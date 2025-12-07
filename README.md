# App Pulse — Product Retention Intelligence Dashboard

App Pulse is a static web application that helps mobile product teams connect sentiment signals from App Store reviews with behavioral retention metrics. It surfaces churn drivers, technical issues, and customer segmentation insights through interactive visualizations.

This was built using GitHub Copilot using Vibe Coding! Check the [Specification Document](SpecificationDocument.md) file used to create this app. It currently uses a sample of a dataset dervied from Kaggle - [App Store Reviews With Sentiment](https://www.kaggle.com/datasets/mirzayasirabdullah07/app-store-reviews-with-sentiment-300k) to give you a feel of the dashboard. Screenshots -

![screenshot1](/assets/Screenshot%202026-03-14%20205808.png)

![screenshot2](/assets/Screenshot%202026-03-14%20205715.png)

![screenshot3](/assets/Screenshot%202026-03-14%20205453.png)

---

## How to Launch

1. **Serve the files locally** — because the app loads CSV data via `fetch`, you need an HTTP server:
   ```bash
   # Option A: Python
   python -m http.server 8000

   # Option B: Node.js
   npx serve .

   # Option C: VS Code Live Server extension
   # Right-click index.html → "Open with Live Server"
   ```
2. Open `http://localhost:8000` (or the port shown) in your browser.

> **Note:** Opening `index.html` directly via `file://` will fail because browsers block CSV/GeoJSON fetches from the file protocol.

---

# Learnings about Vibe Coding

As stated above I used GitHub Copilot to Vibe Code this project. I initially came up with a specification document on what the app should do, what charts to project, how to  read Kaggle sample dataset. My learnings with this experience are as below.

The good -
- Lower experimentation friction - Rapid code generation makes it easy to test multiple analytics ideas quickly. The bottleneck shifts from writing code to deciding which metrics and insights actually matter.
- Encourages product thinking - Since implementation is faster, more time goes into defining the right questions, refining metrics, and improving the story the dashboard tells.

The bad -
- Hidden complexity builds up - Quick iterations can lead to inconsistent patterns and duplicated logic that require later refactoring.
   - In this regard having an architecture.md file helps, and have AI agent read from it and update it so that context about the app is not lost.
- AI optimizes for "working", not "clean" solution - Generated code often solves the immediate problem but may not follow the best architecture.
   - This is why reviewing the code and steering it in the right direction is always so important.
- Debugging shifts from syntax to intent - You spend more time verifying whether the AI correctly understood the problem rather than fixing small code errors.