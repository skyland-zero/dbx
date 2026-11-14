//! The SQL workbench: tabs of query editors with a result grid each.
//!
//! It is a Rust component because the rows never leave Rust: a 10 000-row
//! result crosses no JS boundary, and `DataTable` only builds the rows in
//! view. TSX owns the page's chrome (the connection step and the dialog that
//! asks for a password); this owns the tab strip, the editor toolbar, the
//! editor and the result grid, drawn like `EditorGroupTabBar.vue`,
//! `EditorToolbar.vue` and `ContentArea.vue`.

use nsh_base::{
    button,
    data_table,
    editor::{editor, EditorClasses},
    theme,
    DataTableAlign,
    DataTableClasses,
    DataTableColumn,
    DataTableRows,
};
use nsh_core::element::ImageSrc;
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
    running: Signal<bool>,
    execution_id: Signal<String>,
}

fn new_tab(id: u64) -> Tab {
    let demo = service::is_demo();
    Tab {
        id,
        sql: signal(String::from(if demo {
            "SELECT database_id, name, create_date FROM sys.databases;"
        } else {
            "SELECT @@VERSION AS version;"
        })),
        status: signal(String::from(if demo { "5 行，12 ms" } else { "就绪" })),
        shown: signal(if demo { demo_view() } else { QueryView::default() }),
        running: signal(false),
        execution_id: signal(String::new()),
    }
}

/// The visual pass's result: enough columns and rows to see the grid's type,
/// header and row styles without a SQL Server.
fn demo_view() -> QueryView {
    QueryView {
        columns: vec![
            "database_id".into(),
            "name".into(),
            "create_date".into(),
            "compatibility_level".into(),
        ],
        rows: vec![
            vec!["1".into(), "master".into(), "2024-01-08 10:12:43.937".into(), "160".into()],
            vec!["2".into(), "tempdb".into(), "2024-01-08 10:12:43.937".into(), "160".into()],
            vec!["3".into(), "model".into(), "2024-01-08 10:12:43.937".into(), "160".into()],
            vec!["4".into(), "msdb".into(), "2024-01-08 10:12:43.937".into(), "160".into()],
            vec!["5".into(), "AdventureWorks".into(), "2024-02-14 09:30:01.203".into(), "150".into()],
        ],
        affected_rows: 0,
        elapsed_ms: 12,
        truncated: false,
        execution_id: String::new(),
        message: None,
    }
}

/// A Lucide icon, drawn as authored: its `currentColor` is the text color
/// around it (the element's `text_color`).
fn icon(name: &str, size: f32) -> impl IntoElement {
    let markup: &'static str = match name {
        "play" => include_str!("../../assets/icons/play.svg"),
        "square" => include_str!("../../assets/icons/square.svg"),
        "fast-forward" => include_str!("../../assets/icons/fast-forward.svg"),
        "align-left" => include_str!("../../assets/icons/align-left.svg"),
        "wrap-text" => include_str!("../../assets/icons/wrap-text.svg"),
        "plus" => include_str!("../../assets/icons/plus.svg"),
        "x" => include_str!("../../assets/icons/x.svg"),
        "table-2" => include_str!("../../assets/icons/table-2.svg"),
        "database" => include_str!("../../assets/icons/database.svg"),
        "pin" => include_str!("../../assets/icons/pin.svg"),
        "loader-2" => include_str!("../../assets/icons/loader-2.svg"),
        "more-horizontal" => include_str!("../../assets/icons/more-horizontal.svg"),
        _ => include_str!("../../assets/icons/database.svg"),
    };
    svg(ImageSrc::svg_markup(markup)).w(px(size)).h(px(size))
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

    let close_tab = move |id: u64| {
        let next = tabs.with(|tabs| {
            let mut remaining: Vec<Tab> = tabs.iter().filter(|tab| tab.id != id).cloned().collect();
            if remaining.is_empty() {
                remaining.push(new_tab(id + 1));
            }
            remaining
        });
        let next_active = next
            .iter()
            .find(|tab| tab.id == active.get())
            .or_else(|| next.last())
            .map(|tab| tab.id)
            .unwrap_or(0);
        tabs.set(next);
        active.set(next_active);
    };

    let run = move || {
        let tab = current.get_untracked();
        if tab.running.get() {
            return;
        }
        let connection_id = props.connection_id.get().to_string();
        let statement = tab.sql.get();
        let execution_id = service::new_execution_id();
        tab.execution_id.set(execution_id.clone());
        tab.running.set(true);
        tab.status.set("执行中…".to_owned());
        tab.shown.set(QueryView::default());
        spawn(async move {
            match service::execute(&connection_id, &statement, execution_id).await {
                Ok(result) => {
                    tab.status.set(describe(&result));
                    tab.shown.set(result);
                }
                Err(error) => tab.status.set(format!("执行失败：{error}")),
            }
            tab.running.set(false);
        });
    };

    let cancel = move || {
        let tab = current.get_untracked();
        if !tab.running.get() {
            return;
        }
        let execution_id = tab.execution_id.get();
        if execution_id.is_empty() {
            return;
        }
        tab.status.set("正在取消…".to_owned());
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
        .min_h(px(0.0))
        .bg(move || theme().background)
        .text_color(move || theme().foreground)
        // The tab strip: classic DBX tabs, full height, separated by borders.
        .child(
            view()
                .h(px(36.0))
                .flex_row()
                .items_stretch()
                .border_b_1()
                .border_color(move || theme().border)
                .bg(move || theme().sidebar)
                .child(
                    view()
                        .w(px(32.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .border_r_1()
                        .border_color(move || theme().border)
                        .text_color(move || theme().muted_foreground)
                        .child(icon("table-2", 14.0)),
                )
                .children(tabs.get().into_iter().map(|tab| {
                    let id = tab.id;
                    let is_active = active.get() == id;
                    view()
                        .h(px(36.0))
                        .flex_row()
                        .items_center()
                        .gap_1()
                        .px_2()
                        .border_r_1()
                        .border_color(move || theme().border)
                        .bg(move || {
                            if is_active {
                                theme().background
                            } else {
                                theme().sidebar
                            }
                        })
                        .text_color(move || {
                            if is_active {
                                theme().foreground
                            } else {
                                theme().muted_foreground
                            }
                        })
                        .child(button().on_press(move || active.set(id)).child(
                            view()
                                .flex_row()
                                .items_center()
                                .gap_1()
                                .child(icon("database", 14.0))
                                .child(text(format!("查询 {id}")).text_xs().app_class("font-medium")),
                        ))
                        .child(
                            button()
                                .on_press(move || close_tab(id))
                                .w(px(18.0))
                                .h(px(18.0))
                                .items_center()
                                .justify_center()
                                .rounded(px(3.0))
                                .text_color(move || theme().muted_foreground)
                                .child(icon("x", 12.0)),
                        )
                }))
                .child(
                    button()
                        .on_press(open_tab)
                        .w(px(30.0))
                        .h(px(36.0))
                        .items_center()
                        .justify_center()
                        .text_color(move || theme().muted_foreground)
                        .child(icon("plus", 15.0)),
                )
        )
        // The editor toolbar: run/stop, execute all, format, wrap, status.
        .child(
            view()
                .h(px(36.0))
                .flex_row()
                .items_center()
                .gap_1()
                .px_3()
                .border_b_1()
                .border_color(move || theme().border)
                .bg(move || theme().sidebar)
                .child(
                    button()
                        .on_press(run)
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .rounded(px(4.0))
                        .bg(move || {
                            if current.get().running.get() {
                                rgb(0xfee2e2)
                            } else {
                                rgb(0xd1fae5)
                            }
                        })
                        .text_color(move || {
                            if current.get().running.get() {
                                rgb(0xb91c1c)
                            } else {
                                rgb(0x047857)
                            }
                        })
                        .child(if current.get().running.get() {
                            icon("square", 14.0)
                        } else {
                            icon("play", 14.0)
                        }),
                )
                .child(
                    button()
                        .on_press(cancel)
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .rounded(px(4.0))
                        .text_color(move || theme().muted_foreground)
                        .child(icon("square", 14.0)),
                )
                .child(
                    button()
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .rounded(px(4.0))
                        .text_color(move || theme().muted_foreground)
                        .child(icon("fast-forward", 14.0)),
                )
                .child(
                    button()
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .rounded(px(4.0))
                        .text_color(move || rgb(0xb45309))
                        .child(icon("align-left", 14.0)),
                )
                .child(
                    button()
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .rounded(px(4.0))
                        .text_color(move || theme().muted_foreground)
                        .child(icon("wrap-text", 14.0)),
                )
                .child(view().flex_1()),
        )
        // Editor, 32% of the split, then the result grid at 68%.
        .child(
            view()
                .flex_grow(32.0)
                .basis(px(0.0))
                .min_h(px(120.0))
                .flex_col()
                .bg(move || theme().background)
                .child(
                    editor()
                        .language("sql")
                        .font_family(move || theme().font_mono.clone())
                        .font_size(px(13.0))
                        .line_height(px(20.0))
                        .classes(editor_classes())
                        .value(move || Some(SharedString::from(current.get().sql.get())))
                        .on_change(move |text: &SharedString| current.get().sql.set(text.to_string()))
                        .flex_1(),
                ),
        )
        // The result pane's toolbar.
        .child(
            view()
                .h(px(40.0))
                .flex_row()
                .items_center()
                .gap_1()
                .px_2()
                .border_t_1()
                .border_b_1()
                .border_color(move || theme().border)
                .bg(move || theme().muted)
                .child(
                    button()
                        .w(px(24.0))
                        .h(px(24.0))
                        .items_center()
                        .justify_center()
                        .text_color(move || theme().muted_foreground)
                        .child(icon("pin", 14.0)),
                )
                .child(
                    view()
                        .h(px(16.0))
                        .w(px(1.0))
                        .bg(move || theme().border),
                )
                .child(
                    view()
                        .h(px(28.0))
                        .flex_row()
                        .items_center()
                        .gap_1()
                        .px_2()
                        .rounded(px(6.0))
                        .border_1()
                        .border_color(move || theme().border)
                        .bg(move || theme().background)
                        .child(icon("table-2", 13.0))
                        .child(text("结果 1").text_xs().app_class("font-medium")),
                )
                .child(view().flex_1())
                .child(
                    text(move || {
                        let tab = current.get();
                        tab.shown.with(|result| {
                            if result.columns.is_empty() {
                                String::new()
                            } else {
                                format!("{} 行 · {} 列 · {} ms", result.rows.len(), result.columns.len(), result.elapsed_ms)
                            }
                        })
                    })
                    .text_xs()
                    .text_color(move || theme().muted_foreground),
                ),
        )
        // The result grid.
        .child(
            data_table()
                .flex_grow(68.0)
                .basis(px(0.0))
                .min_h(px(120.0))
                .row_height(px(30.0))
                .header_height(px(30.0))
                .font_size(px(12.0))
                .row_header(true)
                .cell_selectable(true)
                .classes(table_classes())
                .columns(move || {
                    current.get().shown.with(|result| {
                        result
                            .columns
                            .iter()
                            .map(|column| {
                                let mut definition = DataTableColumn::default();
                                definition.key = column.clone().into();
                                definition.title = Some(column.clone().into());
                                definition.width = Some(px(180.0));
                                definition.align = DataTableAlign::Start;
                                definition
                            })
                            .collect::<Vec<_>>()
                    })
                    .into_iter()
                    .chain(std::iter::once(filler_column()))
                    .collect::<Vec<_>>()
                })
                .data(move || current.get().shown.with(rows_of))
                .empty(
                    text("执行 SQL 后在此显示结果")
                        .text_sm()
                        .text_color(move || theme().muted_foreground),
                ),
        )
}

fn editor_classes() -> EditorClasses {
    let mut classes = EditorClasses::default();
    classes.gutter = Some("bg-muted/20".into());
    classes.line_number = Some("text-[11px]".into());
    classes.content = Some("text-xs".into());
    classes.active_line = Some("bg-muted/20".into());
    classes.placeholder = Some("text-muted-foreground".into());
    classes.selection = Some("bg-primary/20".into());
    classes
}

fn table_classes() -> DataTableClasses {
    let mut classes = DataTableClasses::default();
    classes.root = Some("bg-background".into());
    classes.header = Some("bg-muted/40 border-b border-border".into());
    classes.header_cell = Some("px-2 text-left text-xs font-medium text-muted-foreground".into());
    classes.header_content = Some("w-full justify-start".into());
    classes.row = Some("border-b border-border/70 bg-background".into());
    classes.row_hover = Some("bg-muted/40".into());
    classes.row_selected = Some("bg-primary/10".into());
    classes.cell = Some("px-2 text-xs font-mono".into());
    classes.cell_selected = Some("bg-primary/15".into());
    classes.row_header = Some("bg-muted/20 px-2 text-[11px] text-center text-muted-foreground".into());
    classes.row_header_corner = Some("bg-muted/40".into());
    classes.resize_handle = Some("bg-border".into());
    classes.empty = Some("items-center justify-center".into());
    classes
}

fn filler_column() -> DataTableColumn {
    let mut column = DataTableColumn::default();
    column.key = "__filler".into();
    column.title = Some("".into());
    column.width = Some(px(320.0));
    column.resizable = Some(false);
    column.movable = Some(false);
    column.selectable = Some(false);
    column
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
