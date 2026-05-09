# Personal Finance Dashboard Planner App

A Python desktop application for tracking income, expenses, budgets, and savings — with an integrated local AI financial advisor powered by Ollama.

---

## Features

- **Transactions tab** — Add, view, and delete income and expense entries with date, category, amount, and description
- **Charts tab** — Visual breakdown of spending by category and monthly income vs. expense bar charts (matplotlib)
- **Budget tab** — Set monthly spending limits per category; get automatic alerts when you go over budget
- **Savings Goal** — Set a monthly savings target and track whether you're on pace to hit it
- **AI Advisor tab** — Get one-shot financial advice based on your real transaction data using a local Ollama AI model
- **AI Chat tab** — Have a back-and-forth conversation with the AI advisor; includes suggested starter questions
- **AI History tab** — Browse, search, and export all past AI advice and chat responses (CSV and JSONL formats)
- **Data persistence** — All transactions and AI history are saved locally to CSV files and reload automatically on launch

---

## Requirements

### Python
Python 3.9 or higher is required. [Download Python](https://www.python.org/downloads/)

### Python packages
Install the required packages with:

```bash
pip install pandas matplotlib
```

Tkinter is included with standard Python on Windows and macOS. On Linux, install it with:

```bash
sudo apt install python3-tk
```

### Ollama (for AI features)
The AI advisor requires [Ollama](https://ollama.com) running locally.

1. Download and install Ollama from https://ollama.com
2. Pull the model used by the app:

```bash
ollama pull llama3.2
```

3. Ollama must be running in the background before you launch the app. It starts automatically on most systems after install, or you can start it manually:

```bash
ollama serve
```

The app connects to Ollama at `http://localhost:11434`. No internet connection is needed for AI features once the model is downloaded.

---

## How to Run

### Option 1 — With a visible terminal (good for debugging)

```bash
python finance_dashboard.py
```

### Option 2 — Without a terminal window (clean desktop launch, Windows)

```bash
pythonw finance_dashboard.py
```

> On Windows with Miniforge/Anaconda, use the full path if `python` is not on your PATH:
> ```
> C:\Users\YourName\miniforge3\python.exe finance_dashboard.py
> ```

---

## Files in This Project

| File | Purpose |
|------|---------|
| `finance_dashboard.py` | The main application — run this to launch the app |
| `finance_data.csv` | Auto-created on first use; stores all your transactions |
| `ai_advice_history.csv` | Auto-created; stores all AI advice and chat history |
| `ai_advice_history.jsonl` | Same history in JSONL format for easy parsing |
| `ai_study_bundle_gemini.txt` | Full code + teaching prompt for use with Gemini AI |

---

## Setting Up on a New Device

1. Install Python 3.9+ from https://www.python.org/downloads/
2. Clone or download this repository
3. Open a terminal in the project folder and install dependencies:
   ```bash
   pip install pandas matplotlib
   ```
4. Install Ollama from https://ollama.com and pull the model:
   ```bash
   ollama pull llama3.2
   ```
5. Run the app:
   ```bash
   python finance_dashboard.py
   ```

The app will create `finance_data.csv` and the AI history files automatically on first launch.

---

## Notes

- The `node_modules/`, `src/`, `public/`, and `package.json` files in this folder are leftover scaffolding from an initial React setup and are not used by the app.
- All data is stored locally on your machine — nothing is sent to the cloud.
- AI features work fully offline once the Ollama model is downloaded.

