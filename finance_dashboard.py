import tkinter as tk
from tkinter import ttk, messagebox
from tkinter import font as tkfont
import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from datetime import date, datetime
import os
import threading
import json
import csv
import calendar
from urllib import request, error

_APP_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(_APP_DIR, "finance_data.csv")
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
ADVICE_CSV_FILE = os.path.join(_APP_DIR, "ai_advice_history.csv")
ADVICE_JSONL_FILE = os.path.join(_APP_DIR, "ai_advice_history.jsonl")

# ---------- Data Layer ----------

def load_data():
    if os.path.exists(DATA_FILE):
        df = pd.read_csv(DATA_FILE)
        if "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
        return df
    return pd.DataFrame(columns=["Date", "Type", "Category", "Amount", "Description"])

def save_data(df):
    df.to_csv(DATA_FILE, index=False)

# ---------- App ----------

class FinanceDashboard(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Personal Finance Dashboard")
        self.geometry("1180x780")
        self.resizable(True, True)
        self.configure(bg="#f0f2f5")

        self.df = load_data()
        self._ensure_date_column()
        self.last_budget_alert_signature = None
        self.last_savings_alert_month = None
        self.ai_chat_turns = []
        self.suggested_questions = [
            "What are my top 3 overspending categories this month?",
            "Give me a weekly plan to hit my monthly savings goal.",
            "Which budget categories should I reduce first and by how much?",
            "How can I improve cash flow in the next 14 days?",
            "Analyze my recent transactions and flag risky spending patterns.",
            "Create a realistic budget for next month based on my data.",
        ]
        self._configure_ui_for_usability()
        self._build_ui()
        self.refresh_all()

    # ---- UI Construction ----

    def _configure_ui_for_usability(self):
        # Keep widget sizes readable on high-DPI displays.
        self.tk.call("tk", "scaling", 1.6)
        self.option_add("*Font", "Helvetica 12")
        self.option_add("*Entry.Font", "Helvetica 12")
        self.option_add("*Text.Font", "Helvetica 12")

        default_font = tkfont.nametofont("TkDefaultFont")
        default_font.configure(size=14)

        text_font = tkfont.nametofont("TkTextFont")
        text_font.configure(size=13)

        heading_font = tkfont.nametofont("TkHeadingFont")
        heading_font.configure(size=13, weight="bold")

        menu_font = tkfont.nametofont("TkMenuFont")
        menu_font.configure(size=12)

        style = ttk.Style(self)
        style.configure("TNotebook.Tab", padding=(20, 12), font=("Helvetica", 14, "bold"))
        style.configure("Treeview", rowheight=38, font=("Helvetica", 12))
        style.configure("Treeview.Heading", font=("Helvetica", 12, "bold"))
        style.configure("TCombobox", padding=6)

    def _build_ui(self):
        # Header
        header = tk.Frame(self, bg="#2c3e50", pady=18)
        header.pack(fill="x")
        tk.Label(header, text="Personal Finance Dashboard", font=("Helvetica", 26, "bold"),
                 bg="#2c3e50", fg="white").pack()

        # Main layout
        main = tk.Frame(self, bg="#f0f2f5")
        main.pack(fill="both", expand=True, padx=10, pady=10)

        # Left panel: entry + summary
        left = tk.Frame(main, bg="#f0f2f5", width=500)
        left.pack(side="left", fill="y", padx=(0, 10))
        left.pack_propagate(False)

        self._build_entry_form(left)
        self._build_summary(left)

        # Right panel: tabs for charts + transactions
        right = tk.Frame(main, bg="#f0f2f5")
        right.pack(side="left", fill="both", expand=True)

        notebook = ttk.Notebook(right)
        notebook.pack(fill="both", expand=True)

        self.chart_frame = tk.Frame(notebook, bg="white")
        self.table_frame = tk.Frame(notebook, bg="white")
        self.budget_frame = tk.Frame(notebook, bg="white")
        self.ai_frame = tk.Frame(notebook, bg="white")
        self.history_frame = tk.Frame(notebook, bg="white")

        notebook.add(self.chart_frame, text="  Charts  ")
        notebook.add(self.table_frame, text="  Transactions  ")
        notebook.add(self.budget_frame, text="  Budget  ")
        notebook.add(self.ai_frame, text="  AI Advisor  ")
        notebook.add(self.history_frame, text="  AI History  ")

        self._build_table(self.table_frame)
        self._build_budget_tab(self.budget_frame)
        self._build_ai_tab(self.ai_frame)
        self._build_history_tab(self.history_frame)

    def _build_entry_form(self, parent):
        card = tk.LabelFrame(parent, text="Add Transaction", font=("Helvetica", 16, "bold"),
                     bg="#f0f2f5", padx=16, pady=16)
        card.pack(fill="x", pady=(0, 10))

        fields = [("Date (YYYY-MM-DD)", "entry_date"),
                  ("Type", "entry_type"),
                  ("Category", "entry_category"),
                  ("Amount ($)", "entry_amount"),
                  ("Description", "entry_desc")]

        for label, attr in fields:
            tk.Label(card, text=label, bg="#f0f2f5", font=("Helvetica", 12, "bold")).pack(anchor="w")
            if attr == "entry_type":
                widget = ttk.Combobox(card, values=["Income", "Expense"], state="readonly", width=30, height=8)
                widget.set("Expense")
            elif attr == "entry_category":
                widget = ttk.Combobox(card, values=[
                    "Food", "Rent", "Transport", "Entertainment",
                    "Utilities", "Healthcare", "Savings", "Salary", "Other"
                ], width=30, height=10)
                widget.set("Food")
            else:
                widget = tk.Entry(card, width=32, font=("Helvetica", 13))
                if attr == "entry_date":
                    widget.insert(0, str(date.today()))
            widget.pack(pady=(3, 12), anchor="w", ipady=5)
            setattr(self, attr, widget)

        tk.Button(card, text="Add Transaction", command=self._add_transaction,
                  bg="#27ae60", fg="white", font=("Helvetica", 13, "bold"),
                  relief="flat", padx=14, pady=10, cursor="hand2").pack(fill="x", pady=(8, 0))

    def _build_summary(self, parent):
        self.summary_frame = tk.LabelFrame(parent, text="Summary", font=("Helvetica", 16, "bold"),
                                           bg="#f0f2f5", padx=16, pady=16)
        self.summary_frame.pack(fill="x")

    def _build_table(self, parent):
        cols = ("Date", "Type", "Category", "Amount", "Description")
        frame = tk.Frame(parent, bg="white")
        frame.pack(fill="both", expand=True, padx=5, pady=5)

        scroll_y = ttk.Scrollbar(frame, orient="vertical")
        scroll_y.pack(side="right", fill="y")

        self.tree = ttk.Treeview(frame, columns=cols, show="headings",
                                  yscrollcommand=scroll_y.set)
        scroll_y.config(command=self.tree.yview)

        widths = [100, 80, 110, 80, 200]
        for col, w in zip(cols, widths):
            self.tree.heading(col, text=col)
            self.tree.column(col, width=w, anchor="center")

        self.tree.tag_configure("income", foreground="#27ae60")
        self.tree.tag_configure("expense", foreground="#e74c3c")

        self.tree.pack(fill="both", expand=True)

        tk.Button(parent, text="Delete Selected", command=self._delete_selected,
                  bg="#e74c3c", fg="white", relief="flat", padx=12, pady=8,
                  cursor="hand2").pack(pady=5)

    def _build_budget_tab(self, parent):
        top = tk.Frame(parent, bg="white")
        top.pack(fill="x", padx=10, pady=10)

        tk.Label(top, text="Set Monthly Budget by Category",
             font=("Helvetica", 15, "bold"), bg="white").pack(anchor="w")

        self.budget_entries = {}
        categories = ["Food", "Rent", "Transport", "Entertainment",
                      "Utilities", "Healthcare", "Savings", "Other"]

        grid = tk.Frame(top, bg="white")
        grid.pack(fill="x", pady=5)

        for i, cat in enumerate(categories):
            tk.Label(grid, text=cat, bg="white", width=14, anchor="w", font=("Helvetica", 12)).grid(
                row=i // 2, column=(i % 2) * 2, padx=5, pady=3, sticky="w")
            e = tk.Entry(grid, width=12, font=("Helvetica", 12))
            e.insert(0, "0")
            e.grid(row=i // 2, column=(i % 2) * 2 + 1, padx=5, pady=3, ipady=3)
            self.budget_entries[cat] = e

        tk.Button(top, text="Update Budget Chart", command=self._show_budget_chart,
                  bg="#2980b9", fg="white", relief="flat", padx=12, pady=8,
                  cursor="hand2").pack(pady=6, anchor="w")

        goal_frame = tk.Frame(top, bg="white")
        goal_frame.pack(fill="x", pady=(6, 2))
        tk.Label(goal_frame, text="Monthly Savings Goal ($)", bg="white", font=("Helvetica", 12)).pack(side="left")
        self.savings_goal_entry = tk.Entry(goal_frame, width=12, font=("Helvetica", 12))
        self.savings_goal_entry.insert(0, "500")
        self.savings_goal_entry.pack(side="left", padx=8, ipady=3)
        tk.Button(goal_frame, text="Check Goal", command=self._update_savings_goal_status,
                  bg="#16a085", fg="white", relief="flat", padx=12, pady=8,
                  cursor="hand2").pack(side="left")

        self.savings_goal_status = tk.Label(
            top,
            text="",
            bg="white",
            fg="#555",
            justify="left",
            font=("Helvetica", 12),
        )
        self.savings_goal_status.pack(anchor="w", pady=(6, 0))

        self.budget_canvas_frame = tk.Frame(parent, bg="white")
        self.budget_canvas_frame.pack(fill="both", expand=True)

    def _build_ai_tab(self, parent):
        controls = tk.Frame(parent, bg="white")
        controls.pack(fill="x", padx=10, pady=10)

        tk.Label(controls, text="Ollama URL", bg="white", font=("Helvetica", 11, "bold")).grid(
            row=0, column=0, sticky="w", padx=(0, 6))
        self.ollama_url_entry = tk.Entry(controls, width=38, font=("Helvetica", 12))
        self.ollama_url_entry.insert(0, OLLAMA_URL)
        self.ollama_url_entry.grid(row=0, column=1, sticky="w", padx=(0, 16))

        tk.Label(controls, text="Model", bg="white", font=("Helvetica", 11, "bold")).grid(
            row=0, column=2, sticky="w", padx=(0, 6))
        self.ollama_model_entry = tk.Entry(controls, width=22, font=("Helvetica", 12))
        self.ollama_model_entry.insert(0, "llama3.2")
        self.ollama_model_entry.grid(row=0, column=3, sticky="w")

        prompt_row = tk.Frame(parent, bg="white")
        prompt_row.pack(fill="x", padx=10)
        tk.Label(prompt_row, text="One-shot advice focus (optional)", bg="white", font=("Helvetica", 11, "bold")).pack(anchor="w")
        self.ai_focus_entry = tk.Entry(prompt_row, font=("Helvetica", 12))
        self.ai_focus_entry.pack(fill="x", pady=(2, 8))
        self.ai_focus_entry.insert(0, "How can I reduce monthly expenses and improve savings?")

        action_row = tk.Frame(parent, bg="white")
        action_row.pack(fill="x", padx=10, pady=(0, 8))
        tk.Button(action_row, text="Generate Advice", command=self._request_ai_advice,
                  bg="#34495e", fg="white", relief="flat", padx=14, pady=7,
                  cursor="hand2").pack(side="left")
        tk.Button(action_row, text="New Chat", command=self._start_new_chat,
                  bg="#7f8c8d", fg="white", relief="flat", padx=14, pady=7,
                  cursor="hand2").pack(side="left", padx=(8, 0))

        self.ai_status = tk.Label(action_row, text="", bg="white", fg="#666", font=("Helvetica", 12))
        self.ai_status.pack(side="left", padx=12)

        self.ai_output = tk.Text(parent, wrap="word", height=15, bg="#fbfbfb", fg="#222", font=("Helvetica", 12))
        self.ai_output.pack(fill="both", expand=True, padx=10, pady=(0, 10))
        self.ai_output.insert(
            tk.END,
            "AI Chat is ready. Ask about budgets, transactions, savings, or spending patterns.\n\n",
        )

        scroll = ttk.Scrollbar(self.ai_output, orient="vertical", command=self.ai_output.yview)
        self.ai_output.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")

        chat_row = tk.Frame(parent, bg="white")
        chat_row.pack(fill="x", padx=10, pady=(0, 10))
        self.ai_chat_entry = tk.Entry(chat_row, font=("Helvetica", 12))
        self.ai_chat_entry.pack(side="left", fill="x", expand=True)
        self.ai_chat_entry.insert(0, "How can I improve my monthly cash flow?")
        self.ai_chat_entry.bind("<Return>", self._send_chat_message_event)
        tk.Button(chat_row, text="Send", command=self._send_chat_message,
                  bg="#2c3e50", fg="white", relief="flat", padx=16, pady=6,
                  cursor="hand2").pack(side="left", padx=(8, 0))

        suggested_wrap = tk.Frame(parent, bg="white")
        suggested_wrap.pack(fill="x", padx=10, pady=(0, 10))
        tk.Label(
            suggested_wrap,
            text="Suggested Questions (click to send)",
            bg="white",
            font=("Helvetica", 11, "bold"),
        ).pack(anchor="w", pady=(0, 4))

        buttons_wrap = tk.Frame(suggested_wrap, bg="white")
        buttons_wrap.pack(fill="x")
        for i, question in enumerate(self.suggested_questions):
            tk.Button(
                buttons_wrap,
                text=question,
                command=lambda q=question: self._use_suggested_question(q),
                bg="#ecf0f1",
                fg="#2c3e50",
                relief="flat",
                anchor="w",
                cursor="hand2",
                padx=10,
                pady=6,
            ).grid(row=i // 2, column=i % 2, sticky="ew", padx=4, pady=3)

        buttons_wrap.grid_columnconfigure(0, weight=1)
        buttons_wrap.grid_columnconfigure(1, weight=1)

    def _build_history_tab(self, parent):
        controls = tk.Frame(parent, bg="white")
        controls.pack(fill="x", padx=10, pady=10)

        tk.Label(controls, text="Model", bg="white", font=("Helvetica", 11, "bold")).grid(row=0, column=0, sticky="w")
        self.history_model_filter = tk.Entry(controls, width=16, font=("Helvetica", 12))
        self.history_model_filter.grid(row=0, column=1, padx=(6, 14), sticky="w")

        tk.Label(controls, text="Focus Contains", bg="white", font=("Helvetica", 11, "bold")).grid(row=0, column=2, sticky="w")
        self.history_focus_filter = tk.Entry(controls, width=28, font=("Helvetica", 12))
        self.history_focus_filter.grid(row=0, column=3, padx=(6, 14), sticky="w")

        tk.Button(controls, text="Refresh", command=self._refresh_history_table,
                bg="#34495e", fg="white", relief="flat", padx=10, pady=5,
                  cursor="hand2").grid(row=0, column=4, padx=(0, 6))
        tk.Button(controls, text="Clear Filters", command=self._clear_history_filters,
                bg="#95a5a6", fg="white", relief="flat", padx=10, pady=5,
                  cursor="hand2").grid(row=0, column=5)
        tk.Button(controls, text="Export CSV", command=self._export_filtered_history_csv,
              bg="#2980b9", fg="white", relief="flat", padx=10, pady=5,
              cursor="hand2").grid(row=0, column=6, padx=(8, 6))
        tk.Button(controls, text="Export JSONL", command=self._export_filtered_history_jsonl,
              bg="#16a085", fg="white", relief="flat", padx=10, pady=5,
              cursor="hand2").grid(row=0, column=7)

        table_wrap = tk.Frame(parent, bg="white")
        table_wrap.pack(fill="both", expand=True, padx=10)

        columns = ("timestamp", "model", "focus", "advice")
        self.history_tree = ttk.Treeview(table_wrap, columns=columns, show="headings")
        self.history_tree.heading("timestamp", text="Timestamp")
        self.history_tree.heading("model", text="Model")
        self.history_tree.heading("focus", text="Focus")
        self.history_tree.heading("advice", text="Advice Preview")
        self.history_tree.column("timestamp", width=155, anchor="center")
        self.history_tree.column("model", width=100, anchor="center")
        self.history_tree.column("focus", width=260, anchor="w")
        self.history_tree.column("advice", width=360, anchor="w")
        self.history_tree.pack(side="left", fill="both", expand=True)
        self.history_tree.bind("<<TreeviewSelect>>", self._on_history_select)

        history_scroll = ttk.Scrollbar(table_wrap, orient="vertical", command=self.history_tree.yview)
        history_scroll.pack(side="right", fill="y")
        self.history_tree.configure(yscrollcommand=history_scroll.set)

        detail_wrap = tk.Frame(parent, bg="white")
        detail_wrap.pack(fill="both", expand=True, padx=10, pady=(8, 10))
        tk.Label(detail_wrap, text="Selected Advice", bg="white", font=("Helvetica", 11, "bold")).pack(anchor="w")
        self.history_detail_text = tk.Text(detail_wrap, wrap="word", height=9, bg="#fbfbfb", fg="#222", font=("Helvetica", 12))
        self.history_detail_text.pack(fill="both", expand=True)

        self.history_records = []
        self._refresh_history_table()

    # ---- Logic ----

    def _ensure_date_column(self):
        if "Date" not in self.df.columns:
            self.df["Date"] = pd.NaT
            return
        self.df["Date"] = pd.to_datetime(self.df["Date"], errors="coerce")

    def _add_transaction(self):
        try:
            entry_date = pd.to_datetime(self.entry_date.get())
            t_type = self.entry_type.get()
            category = self.entry_category.get().strip()
            amount = float(self.entry_amount.get())
            desc = self.entry_desc.get().strip()
        except ValueError:
            messagebox.showerror("Invalid Input", "Please check your date and amount fields.")
            return

        if amount <= 0:
            messagebox.showerror("Invalid Amount", "Amount must be greater than 0.")
            return

        new_row = pd.DataFrame([{
            "Date": entry_date,
            "Type": t_type,
            "Category": category,
            "Amount": amount,
            "Description": desc
        }])
        self.df = pd.concat([self.df, new_row], ignore_index=True)
        self._ensure_date_column()
        save_data(self.df)
        self.entry_amount.delete(0, tk.END)
        self.entry_desc.delete(0, tk.END)
        self.refresh_all()

    def _delete_selected(self):
        selected = self.tree.selection()
        if not selected:
            return
        for item in selected:
            idx = self.tree.index(item)
            self.df = self.df.drop(self.df.index[idx]).reset_index(drop=True)
        save_data(self.df)
        self.refresh_all()

    def refresh_all(self):
        self._ensure_date_column()
        self._refresh_summary()
        self._refresh_table()
        self._show_charts()
        self._update_savings_goal_status(show_popup=False)
        self._check_budget_overruns()

    def _refresh_summary(self):
        for w in self.summary_frame.winfo_children():
            w.destroy()

        income = self.df[self.df["Type"] == "Income"]["Amount"].sum()
        expenses = self.df[self.df["Type"] == "Expense"]["Amount"].sum()
        balance = income - expenses

        items = [("Total Income", f"${income:,.2f}", "#27ae60"),
                 ("Total Expenses", f"${expenses:,.2f}", "#e74c3c"),
                 ("Net Balance", f"${balance:,.2f}", "#2980b9" if balance >= 0 else "#e74c3c")]

        for label, value, color in items:
            row = tk.Frame(self.summary_frame, bg="#f0f2f5")
            row.pack(fill="x", pady=2)
            tk.Label(row, text=label, bg="#f0f2f5", font=("Helvetica", 12),
                     fg="#555").pack(side="left")
            tk.Label(row, text=value, bg="#f0f2f5", font=("Helvetica", 13, "bold"),
                     fg=color).pack(side="right")

    def _refresh_table(self):
        self.tree.delete(*self.tree.get_children())
        for _, row in self.df.sort_values("Date", ascending=False).iterrows():
            tag = "income" if row["Type"] == "Income" else "expense"
            self.tree.insert("", "end", values=(
                str(row["Date"])[:10],
                row["Type"],
                row["Category"],
                f"${row['Amount']:,.2f}",
                row["Description"]
            ), tags=(tag,))

    def _show_charts(self):
        for w in self.chart_frame.winfo_children():
            w.destroy()

        if self.df.empty:
            tk.Label(self.chart_frame, text="No data yet. Add transactions to see charts.",
                     bg="white", font=("Helvetica", 12), fg="#888").pack(expand=True)
            return

        fig, axes = plt.subplots(1, 2, figsize=(8, 4))
        fig.patch.set_facecolor("white")

        # Pie chart: expenses by category
        expenses = self.df[self.df["Type"] == "Expense"].groupby("Category")["Amount"].sum()
        if not expenses.empty:
            axes[0].pie(expenses, labels=expenses.index, autopct="%1.1f%%",
                        startangle=140, textprops={"fontsize": 8})
            axes[0].set_title("Expenses by Category", fontsize=10)
        else:
            axes[0].text(0.5, 0.5, "No expenses", ha="center", va="center")
            axes[0].set_title("Expenses by Category", fontsize=10)

        # Bar chart: monthly income vs expenses
        monthly = self.df.copy()
        monthly["Month"] = monthly["Date"].dt.to_period("M").astype(str)
        grouped = monthly.groupby(["Month", "Type"])["Amount"].sum().unstack(fill_value=0)
        if not grouped.empty:
            grouped.plot(kind="bar", ax=axes[1], color=["#e74c3c", "#27ae60"],
                         edgecolor="none")
            axes[1].set_title("Monthly Income vs Expenses", fontsize=10)
            axes[1].set_xlabel("")
            axes[1].tick_params(axis="x", labelrotation=30, labelsize=7)
            axes[1].legend(fontsize=8)
        else:
            axes[1].text(0.5, 0.5, "No data", ha="center", va="center")

        fig.tight_layout()
        canvas = FigureCanvasTkAgg(fig, master=self.chart_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)
        plt.close(fig)

    def _show_budget_chart(self):
        for w in self.budget_canvas_frame.winfo_children():
            w.destroy()

        budgets = self._collect_budget_values()

        if not budgets:
            messagebox.showinfo("Budget", "Enter at least one budget amount.")
            return

        actuals = self.df[self.df["Type"] == "Expense"].groupby("Category")["Amount"].sum()

        cats = list(budgets.keys())
        bud_vals = [budgets[c] for c in cats]
        act_vals = [actuals.get(c, 0) for c in cats]

        fig, ax = plt.subplots(figsize=(7, 3.5))
        fig.patch.set_facecolor("white")
        x = range(len(cats))
        ax.bar([i - 0.2 for i in x], bud_vals, width=0.4, label="Budget",
               color="#3498db", edgecolor="none")
        ax.bar([i + 0.2 for i in x], act_vals, width=0.4, label="Actual",
               color="#e74c3c", edgecolor="none")
        ax.set_xticks(list(x))
        ax.set_xticklabels(cats, rotation=30, fontsize=8)
        ax.set_title("Budget vs Actual Spending", fontsize=10)
        ax.legend(fontsize=8)
        fig.tight_layout()

        canvas = FigureCanvasTkAgg(fig, master=self.budget_canvas_frame)
        canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)
        plt.close(fig)
        self._update_savings_goal_status(show_popup=False)
        self._check_budget_overruns()

    def _collect_budget_values(self):
        budgets = {}
        for cat, entry in self.budget_entries.items():
            try:
                val = float(entry.get())
                if val > 0:
                    budgets[cat] = val
            except ValueError:
                continue
        return budgets

    def _current_month_financials(self):
        if self.df.empty:
            return 0.0, 0.0, 0.0

        today = date.today()
        month_key = today.strftime("%Y-%m")
        month_df = self.df[self.df["Date"].dt.strftime("%Y-%m") == month_key]
        income = float(month_df[month_df["Type"] == "Income"]["Amount"].sum())
        expenses = float(month_df[month_df["Type"] == "Expense"]["Amount"].sum())
        savings = income - expenses
        return income, expenses, savings

    def _update_savings_goal_status(self, show_popup=True):
        try:
            goal = float(self.savings_goal_entry.get())
        except ValueError:
            self.savings_goal_status.config(text="Savings goal must be a valid number.", fg="#e74c3c")
            return

        if goal <= 0:
            self.savings_goal_status.config(text="Set a monthly savings goal greater than $0.", fg="#555")
            return

        today = date.today()
        _, _, current_savings = self._current_month_financials()
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        days_left = max(1, days_in_month - today.day + 1)
        remaining = goal - current_savings
        daily_needed = max(0.0, remaining / days_left)

        if remaining <= 0:
            text = (
                f"Goal met this month. Current savings: ${current_savings:,.2f} | "
                f"Goal: ${goal:,.2f}"
            )
            self.savings_goal_status.config(text=text, fg="#27ae60")
            self.last_savings_alert_month = None
            return

        text = (
            f"Current month savings: ${current_savings:,.2f} | Goal: ${goal:,.2f} | "
            f"Still needed: ${remaining:,.2f} (about ${daily_needed:,.2f}/day for {days_left} days)"
        )
        self.savings_goal_status.config(text=text, fg="#e67e22")

        month_marker = today.strftime("%Y-%m")
        if show_popup and self.last_savings_alert_month != month_marker:
            messagebox.showwarning(
                "Savings Goal Alert",
                (
                    "You are currently behind your monthly savings goal.\n\n"
                    f"Goal: ${goal:,.2f}\n"
                    f"Current savings: ${current_savings:,.2f}\n"
                    f"Still needed: ${remaining:,.2f}\n"
                    f"Required pace: ${daily_needed:,.2f}/day"
                ),
            )
            self.last_savings_alert_month = month_marker

    def _check_budget_overruns(self):
        budgets = self._collect_budget_values()
        if not budgets:
            self.last_budget_alert_signature = None
            return

        actuals = self.df[self.df["Type"] == "Expense"].groupby("Category")["Amount"].sum()
        overruns = []
        for cat, budget in budgets.items():
            actual = float(actuals.get(cat, 0.0))
            if actual > budget:
                overruns.append((cat, budget, actual, actual - budget))

        if not overruns:
            self.last_budget_alert_signature = None
            return

        signature = tuple((c, round(b, 2), round(a, 2)) for c, b, a, _ in sorted(overruns))
        if signature == self.last_budget_alert_signature:
            return

        lines = [
            f"- {cat}: Budget ${budget:,.2f}, Actual ${actual:,.2f} (Over by ${delta:,.2f})"
            for cat, budget, actual, delta in overruns
        ]
        messagebox.showwarning("Budget Alert", "Categories over budget:\n\n" + "\n".join(lines))
        self.last_budget_alert_signature = signature

    def _build_finance_snapshot(self):
        income = self.df[self.df["Type"] == "Income"]["Amount"].sum()
        expenses = self.df[self.df["Type"] == "Expense"]["Amount"].sum()
        balance = income - expenses

        recent = self.df.sort_values("Date", ascending=False).head(20)
        recent_records = []
        for _, row in recent.iterrows():
            recent_records.append({
                "date": str(row["Date"])[:10],
                "type": row["Type"],
                "category": row["Category"],
                "amount": float(row["Amount"]),
                "description": row["Description"],
            })

        expenses_by_category = (
            self.df[self.df["Type"] == "Expense"]
            .groupby("Category")["Amount"]
            .sum()
            .sort_values(ascending=False)
            .to_dict()
        )

        budgets = self._collect_budget_values()
        budget_vs_actual = []
        for cat, budget in budgets.items():
            actual = float(expenses_by_category.get(cat, 0.0))
            budget_vs_actual.append({
                "category": cat,
                "budget": float(budget),
                "actual": actual,
                "variance": float(budget - actual),
            })

        snapshot = {
            "summary": {
                "total_income": float(income),
                "total_expenses": float(expenses),
                "net_balance": float(balance),
            },
            "expenses_by_category": {k: float(v) for k, v in expenses_by_category.items()},
            "budget_vs_actual": budget_vs_actual,
            "recent_transactions": recent_records,
        }
        return snapshot

    def _build_ai_prompt(self):
        focus = self.ai_focus_entry.get().strip()
        if not focus:
            focus = "Give practical budget and spending advice."

        snapshot = self._build_finance_snapshot()
        return (
            "You are a personal finance coach. Provide actionable advice based on the user's data. "
            "Keep response concise with sections: Key Insights, Risks, Action Plan (next 30 days), "
            "and 3 concrete savings opportunities. Do not provide legal or investment guarantees.\n\n"
            f"User focus: {focus}\n\n"
            "Financial data (JSON):\n"
            f"{json.dumps(snapshot, indent=2)}"
        )

    def _build_chat_system_prompt(self):
        snapshot = self._build_finance_snapshot()
        return (
            "You are a personal finance chatbot embedded in a budgeting app. "
            "Use the provided financial data as source of truth. Give practical, safe, non-legal, "
            "non-guaranteed guidance. Be specific and concise.\n\n"
            "When useful, include:\n"
            "- quick diagnosis\n"
            "- what to change this week\n"
            "- numeric targets\n"
            "- one caution\n\n"
            "App financial data (JSON):\n"
            f"{json.dumps(snapshot, indent=2)}"
        )

    def _start_new_chat(self):
        self.ai_chat_turns = []
        self.ai_output.delete("1.0", tk.END)
        self.ai_output.insert(
            tk.END,
            "Started a new AI chat. Ask a question about your budgets, transactions, and savings.\n\n",
        )
        self.ai_status.config(text="New chat")

    def _send_chat_message_event(self, _event):
        self._send_chat_message()

    def _use_suggested_question(self, question):
        self.ai_chat_entry.delete(0, tk.END)
        self.ai_chat_entry.insert(0, question)
        self._send_chat_message()

    def _append_chat_line(self, speaker, text):
        self.ai_output.insert(tk.END, f"{speaker}:\n{text.strip()}\n\n")
        self.ai_output.see(tk.END)

    def _get_ollama_chat_url(self):
        raw_url = self.ollama_url_entry.get().strip() or OLLAMA_URL
        if raw_url.endswith("/api/chat"):
            return raw_url
        if raw_url.endswith("/api/generate"):
            return raw_url[:-len("/api/generate")] + "/api/chat"
        return raw_url.rstrip("/") + "/api/chat"

    def _send_chat_message(self):
        user_text = self.ai_chat_entry.get().strip()
        if not user_text:
            return

        if self.df.empty:
            messagebox.showinfo("AI Chat", "Add at least one transaction first for data-aware advice.")
            return

        self.ai_chat_entry.delete(0, tk.END)
        self._append_chat_line("You", user_text)
        self.ai_status.config(text="Thinking...")

        self.ai_chat_turns.append({"role": "user", "content": user_text})
        model = self.ollama_model_entry.get().strip() or "llama3.2"
        chat_url = self._get_ollama_chat_url()
        system_prompt = self._build_chat_system_prompt()

        worker = threading.Thread(
            target=self._fetch_ai_chat_response,
            args=(chat_url, model, system_prompt, list(self.ai_chat_turns), user_text),
            daemon=True,
        )
        worker.start()

    def _request_ai_advice(self):
        if self.df.empty:
            messagebox.showinfo("AI Advisor", "Add a few transactions first so advice is meaningful.")
            return

        self.ai_status.config(text="Generating advice...")
        self.ai_output.delete("1.0", tk.END)
        self.ai_output.insert(tk.END, "Contacting Ollama...\n")

        prompt = self._build_ai_prompt()
        focus = self.ai_focus_entry.get().strip()
        model = self.ollama_model_entry.get().strip() or "llama3.2"
        url = self.ollama_url_entry.get().strip() or OLLAMA_URL

        worker = threading.Thread(
            target=self._fetch_ai_advice,
            args=(url, model, prompt, focus),
            daemon=True,
        )
        worker.start()

    def _fetch_ai_advice(self, url, model, prompt, focus):
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3}
        }

        req = request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            answer = data.get("response", "No response returned by model.")
            self.after(0, self._set_ai_output, answer, model, focus)
        except error.URLError:
            self.after(0, self._set_ai_error,
                       "Could not connect to Ollama. Start it first, then run: ollama serve")
        except Exception as exc:
            self.after(0, self._set_ai_error, f"AI request failed: {exc}")

    def _fetch_ai_chat_response(self, chat_url, model, system_prompt, turns, user_text):
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system_prompt}] + turns,
            "stream": False,
            "options": {"temperature": 0.3},
        }

        req = request.Request(
            chat_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            answer = data.get("message", {}).get("content", "No response returned by model.")
            self.after(0, self._set_ai_chat_output, answer, model, user_text)
        except error.URLError:
            self.after(
                0,
                self._set_ai_error,
                "Could not connect to Ollama. Start it first, then run: ollama serve",
            )
        except Exception as exc:
            self.after(0, self._set_ai_error, f"AI chat request failed: {exc}")

    def _set_ai_output(self, text, model, focus):
        self.ai_status.config(text="Done")
        self._append_chat_line("AI (Advice)", text)
        self._save_ai_advice_history(text.strip(), model, focus)
        self._refresh_history_table()

    def _set_ai_chat_output(self, text, model, user_prompt):
        self.ai_status.config(text="Done")
        self.ai_chat_turns.append({"role": "assistant", "content": text.strip()})
        self._append_chat_line("AI", text)
        self._save_ai_advice_history(text.strip(), model, f"chat: {user_prompt}")
        self._refresh_history_table()

    def _save_ai_advice_history(self, advice_text, model, focus):
        timestamp = datetime.now().isoformat(timespec="seconds")
        row = {
            "timestamp": timestamp,
            "model": model,
            "focus": focus,
            "advice": advice_text,
        }

        csv_exists = os.path.exists(ADVICE_CSV_FILE)
        with open(ADVICE_CSV_FILE, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["timestamp", "model", "focus", "advice"])
            if not csv_exists:
                writer.writeheader()
            writer.writerow(row)

        with open(ADVICE_JSONL_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def _load_advice_history(self):
        if not os.path.exists(ADVICE_CSV_FILE):
            return []

        records = []
        with open(ADVICE_CSV_FILE, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                records.append({
                    "timestamp": row.get("timestamp", ""),
                    "model": row.get("model", ""),
                    "focus": row.get("focus", ""),
                    "advice": row.get("advice", ""),
                })
        records.reverse()
        return records

    def _clear_history_filters(self):
        self.history_model_filter.delete(0, tk.END)
        self.history_focus_filter.delete(0, tk.END)
        self._refresh_history_table()

    def _refresh_history_table(self):
        if not hasattr(self, "history_tree"):
            return

        self.history_tree.delete(*self.history_tree.get_children())
        all_records = self._load_advice_history()

        model_filter = self.history_model_filter.get().strip().lower()
        focus_filter = self.history_focus_filter.get().strip().lower()

        filtered = []
        for rec in all_records:
            model_ok = not model_filter or model_filter in rec["model"].lower()
            focus_ok = not focus_filter or focus_filter in rec["focus"].lower()
            if model_ok and focus_ok:
                filtered.append(rec)

        self.history_records = filtered
        for idx, rec in enumerate(filtered):
            advice_preview = rec["advice"].replace("\n", " ").strip()
            if len(advice_preview) > 110:
                advice_preview = advice_preview[:107] + "..."
            focus_preview = rec["focus"].replace("\n", " ").strip()
            self.history_tree.insert(
                "",
                "end",
                iid=str(idx),
                values=(rec["timestamp"], rec["model"], focus_preview, advice_preview),
            )

        self.history_detail_text.delete("1.0", tk.END)
        if filtered:
            self.history_tree.selection_set("0")
            self.history_tree.focus("0")
            self._on_history_select()
        else:
            self.history_detail_text.insert(tk.END, "No history entries found for current filters.")

    def _on_history_select(self, _event=None):
        if not hasattr(self, "history_tree"):
            return

        selected = self.history_tree.selection()
        if not selected:
            return

        idx = int(selected[0])
        if idx < 0 or idx >= len(self.history_records):
            return

        rec = self.history_records[idx]
        details = (
            f"Timestamp: {rec['timestamp']}\n"
            f"Model: {rec['model']}\n"
            f"Focus: {rec['focus']}\n\n"
            f"Advice:\n{rec['advice']}"
        )
        self.history_detail_text.delete("1.0", tk.END)
        self.history_detail_text.insert(tk.END, details)

    def _default_history_export_path(self, extension):
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"ai_advice_history_export_{stamp}.{extension}"
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)

    def _export_filtered_history_csv(self):
        if not self.history_records:
            messagebox.showinfo("Export", "No filtered history entries to export.")
            return

        export_path = self._default_history_export_path("csv")
        with open(export_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["timestamp", "model", "focus", "advice"])
            writer.writeheader()
            writer.writerows(self.history_records)

        messagebox.showinfo("Export Complete", f"Filtered history exported to:\n{export_path}")

    def _export_filtered_history_jsonl(self):
        if not self.history_records:
            messagebox.showinfo("Export", "No filtered history entries to export.")
            return

        export_path = self._default_history_export_path("jsonl")
        with open(export_path, "w", encoding="utf-8") as f:
            for rec in self.history_records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")

        messagebox.showinfo("Export Complete", f"Filtered history exported to:\n{export_path}")

    def _set_ai_error(self, message):
        self.ai_status.config(text="Failed")
        self._append_chat_line("System", message)


if __name__ == "__main__":
    app = FinanceDashboard()
    app.mainloop()
