//! The SQL workbench: a query editor, a result grid and the status of the
//! last run.
//!
//! It is a Rust component because the rows never leave Rust: a 10 000-row
//! result crosses no JS boundary, and `DataTable` only builds the rows in
//! view. TSX owns the page's chrome (back, connection, password) and renders
//! this component once the connection is open.

use nsh_base::{button, data_table, editor::editor, theme, DataTableColumn, DataTableRows};
use nsh_core::prelude::*;

use crate::service::{self, QueryView};

/// What TSX passes: the saved connection to run statements on.
#[derive(Debug, Clone, PartialEq, Props)]
pub struct SqlWorkbenchProps {
    /// The id of a connection `/api/connection/connect` has opened.
    pub connection_id: Prop<SharedString>,
}

/// The SQL workbench of one connection.
#[component]
pub fn SqlWorkbench(props: SqlWorkbenchProps) -> impl IntoElement {
    let sql = signal(String::from("SELECT @@VERSION AS version;"));
    let status = signal(String::from("就绪"));
    let shown = signal(QueryView::default());

    let run = move || {
        let connection_id = props.connection_id.get().to_string();
        let statement = sql.get();
        status.set("执行中…".to_owned());
        shown.set(QueryView::default());
        spawn(async move {
            match service::execute(&connection_id, &statement).await {
                Ok(result) => {
                    status.set(describe(&result));
                    shown.set(result);
                }
                Err(error) => status.set(format!("执行失败：{error}")),
            }
        });
    };

    let cancel = move || {
        let execution_id = shown.with(|result| result.execution_id.clone());
        if execution_id.is_empty() {
            return;
        }
        spawn(async move {
            match service::cancel(execution_id).await {
                Ok(()) => status.set("已请求取消".to_owned()),
                Err(error) => status.set(format!("取消失败：{error}")),
            }
        });
    };

    view()
        .flex_1()
        .flex_col()
        .bg(move || theme().background)
        .text_color(move || theme().foreground)
        .child(
            view()
                .flex_row()
                .items_center()
                .gap_2()
                .px_3()
                .py_2()
                .border_b_1()
                .border_color(move || theme().border)
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
                .child(text(move || status.get()).text_sm().text_color(move || theme().muted_foreground)),
        )
        .child(
            editor()
                .language("sql")
                .default_value(SharedString::from(sql.get_untracked()))
                .on_change(move |text: &SharedString| sql.set(text.to_string()))
                .flex_1(),
        )
        .child(
            data_table()
                .flex_1()
                .columns(move || {
                    shown.with(|result| {
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
                .data(move || shown.with(rows_of)),
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
