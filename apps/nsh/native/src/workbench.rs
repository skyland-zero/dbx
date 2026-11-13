//! The SQL workbench: tabs of query editors with a result grid each.
//!
//! It is a Rust component because the rows never leave Rust: a 10 000-row
//! result crosses no JS boundary, and `DataTable` only builds the rows in
//! view. TSX owns the page's chrome (back, connection, the connect step) and
//! renders this component once the connection is open.

use nsh_base::{button, data_table, editor::editor, theme, DataTableColumn, DataTableRows};
use nsh_core::prelude::*;

use crate::service::{self, QueryView};

/// What TSX passes: the saved connection to run statements on.
#[derive(Debug, Clone, PartialEq, Props)]
pub struct SqlWorkbenchProps {
    /// The id of a connection `/api/connection/connect` has opened.
    pub connection_id: Prop<SharedString>,
}

/// One tab: its statement, the status of its last run and what it returned.
///
/// The signals are the tab's state; the tab keeps its own results while
/// another tab is shown.
#[derive(Clone, PartialEq)]
struct Tab {
    id: u64,
    sql: Signal<String>,
    status: Signal<String>,
    shown: Signal<QueryView>,
}

fn new_tab(id: u64) -> Tab {
    Tab {
        id,
        sql: signal(String::from("SELECT @@VERSION AS version;")),
        status: signal(String::from("就绪")),
        shown: signal(QueryView::default()),
    }
}

/// The SQL workbench of one connection.
#[component]
pub fn SqlWorkbench(props: SqlWorkbenchProps) -> impl IntoElement {
    let tabs = signal(vec![new_tab(1)]);
    let active = signal(1u64);
    let current = computed(move || {
        tabs.get()
            .into_iter()
            .find(|tab| tab.id == active.get())
            .or_else(|| tabs.get().into_iter().next())
            .unwrap_or_else(|| new_tab(0))
    });

    let open_tab = move || {
        let id = tabs.with(|tabs| tabs.iter().map(|tab| tab.id).max().unwrap_or(0) + 1);
        tabs.update(move |tabs| tabs.push(new_tab(id)));
        active.set(id);
    };

    let run = move || {
        let tab = current.get_untracked();
        let connection_id = props.connection_id.get().to_string();
        let statement = tab.sql.get();
        tab.status.set("执行中…".to_owned());
        tab.shown.set(QueryView::default());
        spawn(async move {
            match service::execute(&connection_id, &statement).await {
                Ok(result) => {
                    tab.status.set(describe(&result));
                    tab.shown.set(result);
                }
                Err(error) => tab.status.set(format!("执行失败：{error}")),
            }
        });
    };

    let cancel = move || {
        let tab = current.get_untracked();
        let execution_id = tab.shown.with(|result| result.execution_id.clone());
        if execution_id.is_empty() {
            return;
        }
        spawn(async move {
            match service::cancel(execution_id).await {
                Ok(()) => tab.status.set("已请求取消".to_owned()),
                Err(error) => tab.status.set(format!("取消失败：{error}")),
            }
        });
    };

    view()
        .flex_1()
        .flex_col()
        .bg(move || theme().background)
        .text_color(move || theme().foreground)
        .child(
            // The tab strip: one button per tab, then the button that opens one.
            view()
                .flex_row()
                .items_center()
                .gap_1()
                .px_2()
                .py_1()
                .border_b_1()
                .border_color(move || theme().border)
                .children(tabs.get().into_iter().map(|tab| {
                    let id = tab.id;
                    button()
                        .on_press(move || active.set(id))
                        .px_3()
                        .py_1()
                        .rounded(move || theme().radius)
                        .bg(move || if active.get() == id { theme().muted } else { theme().background })
                        .child(text(format!("查询 {id}")).text_sm())
                }))
                .child(
                    button()
                        .on_press(open_tab)
                        .px_2()
                        .py_1()
                        .rounded(move || theme().radius)
                        .border_1()
                        .border_color(move || theme().border)
                        .child(text("+").text_sm()),
                )
                .child(view().flex_1())
                .child(
                    button()
                        .on_press(run)
                        .px_3()
                        .py_1()
                        .rounded(move || theme().radius)
                        .bg(move || theme().primary)
                        .child(text("运行").text_color(move || theme().primary_foreground)),
                )
                .child(
                    button()
                        .on_press(cancel)
                        .px_3()
                        .py_1()
                        .rounded(move || theme().radius)
                        .border_1()
                        .border_color(move || theme().border)
                        .child(text("取消")),
                )
                .child(text(move || current.get().status.get()).text_sm().text_color(move || theme().muted_foreground)),
        )
        .child(
            editor()
                .language("sql")
                // Controlled by the active tab's text, so switching tabs shows
                // that tab's statement and edits are written back to it.
                .value(move || Some(SharedString::from(current.get().sql.get())))
                .on_change(move |text: &SharedString| current.get().sql.set(text.to_string()))
                .flex_1(),
        )
        .child(
            data_table()
                .flex_1()
                .columns(move || {
                    current.get().shown.with(|result| {
                        result
                            .columns
                            .iter()
                            .map(|column| {
                                let mut definition = DataTableColumn::default();
                                definition.key = column.clone().into();
                                definition
                            })
                            .collect::<Vec<_>>()
                    })
                })
                .data(move || current.get().shown.with(rows_of)),
        )
}

fn describe(view: &QueryView) -> String {
    if view.rows.is_empty() {
        format!("{} 行受影响，{} ms", view.affected_rows, view.elapsed_ms)
    } else if view.truncated {
        format!("{} 行（已截断），{} ms", view.rows.len(), view.elapsed_ms)
    } else {
        format!("{} 行，{} ms", view.rows.len(), view.elapsed_ms)
    }
}

fn rows_of(view: &QueryView) -> DataTableRows {
    let mut rows = DataTableRows::new(view.rows.len());
    for (index, column) in view.columns.iter().enumerate() {
        let cells: Vec<String> = view.rows.iter().map(|row| row.get(index).cloned().unwrap_or_default()).collect();
        rows = rows.texts(column, cells);
    }
    rows
}
