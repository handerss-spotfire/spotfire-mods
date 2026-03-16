import { renderBarChart } from "./bar-chart";
import { renderScatterPlot } from "./scatter-plot";

Spotfire.initialize(async (mod: Spotfire.Mod) => {
    const reader = mod.createReader(mod.visualization.data(), mod.visualization.layers(), mod.windowSize(), mod.property("RowHeight"));
    const context = mod.getRenderContext();
    reader.subscribe(render);

    async function render(dataView: Spotfire.DataView, layers: Spotfire.ModLayers, windowSize: Spotfire.Size, rowHeight: Spotfire.ModProperty<number>) {
        const minimumRowHeight = 24;
        const minimumColumnWidth = 40;

        let errors = await dataView.getErrors();
        if (errors.length > 0) {
            mod.controls.errorOverlay.show(errors);
            return;
        }
        mod.controls.errorOverlay.hide();

        const container = document.querySelector("#mod-container") as HTMLDivElement;
        if (!container) {
            mod.controls.errorOverlay.show(
                "Failed to find the DOM node with id #mod-container which should contain the visualization."
            );
            return;
        }

        container.style["width"] = `${windowSize.width}px`;
        container.style["height"] = `${windowSize.height}px`;

        const table = document.createElement("div");
        table.classList.add("table");

        const rowByHierarchy = (await dataView.hierarchy("Row by"))!;
        const rowByRoot = await rowByHierarchy.root();
        if (!rowByRoot) {
            return;
        }

        const renderTasks: Promise<void>[] = [];
        const rowByLeaves = rowByRoot.leaves();
        for (const row of rowByLeaves) {
            const rowLabel = document.createElement("div");
            rowLabel.classList.add("row-label");
            rowLabel.textContent = row.formattedPath();
            rowLabel.style["height"] = `${rowHeight.value()}px`;
            table.appendChild(rowLabel);

            const miniVisRow = document.createElement("div");
            miniVisRow.style["height"] = `${rowHeight.value()}px`;
            miniVisRow.classList.add("mini-visualization-row");

            if (context.isEditing) {
                addRowResizeHandle(miniVisRow);
            }

            table.appendChild(miniVisRow);

            for (const layer of layers.items) {
                const miniVisCell = document.createElement("div");
                miniVisCell.classList.add("mini-visualization-cell");
                const columnWidth = await layer.property("ColumnWidth");
                miniVisCell.style["width"] = `${columnWidth.value()}px`;

                if (context.isEditing) {
                    addColumnResizeHandle(miniVisCell, columnWidth);
                }

                if (layer.type === "Bar Chart") {
                    renderTasks.push(renderBarChart(mod, miniVisCell, layer, row.leafIndex!, rowHeight.value()!));
                } else if (layer.type === "Scatter Plot") {
                    renderTasks.push(renderScatterPlot(mod, miniVisCell, layer, row.leafIndex!, rowHeight.value()!));
                }

                miniVisRow.appendChild(miniVisCell);
            }
        }

        await Promise.allSettled(renderTasks);

        container.innerHTML = "";
        container.appendChild(table);

        context.signalRenderComplete();

        if (context.isEditing) {
            container.addEventListener("click", e => {
                const target = e.target as HTMLElement;
                if (target === container || target.parentElement === container) {
                    mod.visualization.data().clearMarking();
                }
            });
        }

        function addRowResizeHandle(miniVisRow: HTMLDivElement) {
            const rowResizeHandle = document.createElement("div");
            rowResizeHandle.classList.add("row-resize-handle");

            rowResizeHandle.addEventListener("mousedown", event => {
                event.preventDefault();

                const startY = event.clientY;
                const startHeight = rowHeight.value() ?? minimumRowHeight;

                const onMouseMove = (moveEvent: MouseEvent) => {
                    const deltaY = moveEvent.clientY - startY;
                    rowResizeHandle.style.transform = `translateY(${deltaY}px)`;
                };

                const onMouseUp = async (upEvent: MouseEvent) => {
                    const nextHeight = Math.max(minimumRowHeight, Math.round(startHeight + (upEvent.clientY - startY)));
                    rowResizeHandle.style.transform = "";
                    rowHeight.set(nextHeight);

                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };

                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });

            miniVisRow.appendChild(rowResizeHandle);
        }

        function addColumnResizeHandle(miniVisCell: HTMLDivElement, columnWidth: Spotfire.ModProperty<number>) {
            const columnResizeHandle = document.createElement("div");
            columnResizeHandle.classList.add("column-resize-handle");

            columnResizeHandle.addEventListener("mousedown", event => {
                event.preventDefault();
                event.stopPropagation();

                const startX = event.clientX;
                const startWidth = columnWidth.value<number>() ?? minimumColumnWidth;

                const onMouseMove = (moveEvent: MouseEvent) => {
                    const deltaX = moveEvent.clientX - startX;
                    columnResizeHandle.style.transform = `translateX(${deltaX}px)`;
                };

                const onMouseUp = async (upEvent: MouseEvent) => {
                    const nextWidth = Math.max(minimumColumnWidth, Math.round(startWidth + (upEvent.clientX - startX)));
                    columnResizeHandle.style.transform = "";
                    columnWidth.set(nextWidth);

                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                };

                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            });

            miniVisCell.appendChild(columnResizeHandle);
        };
    }
});
