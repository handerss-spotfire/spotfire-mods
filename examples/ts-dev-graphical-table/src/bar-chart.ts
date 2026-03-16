import { select, scaleBand, min, max, scaleLinear } from "d3";

export async function renderBarChart(mod: Spotfire.Mod, cell: HTMLDivElement, layer: Spotfire.ModLayer, leafIndex: number, rowHeight: number) {
    const chartMargin = 4;

    const layerData = await layer.data();
    const dataErrors = await layerData.getErrors();
    if (dataErrors.length > 0) {
        cell.innerText = dataErrors.join("\n");
        return;
    }

    const rowByHierarchy = (await layerData.hierarchy("Row by"))!;
    const rowByRoot = await rowByHierarchy.root();
    if (!rowByRoot) {
        return;
    }

    const rowLeaves = rowByRoot.leaves().filter(leaf => leaf.leafIndex! === leafIndex);
    if (rowLeaves.length === 0) {
        return;
    }

    const leaf = rowLeaves[0];
    const data: { category: string; value: number; color: string; row: Spotfire.DataViewRow }[] = [];
    for (const row of leaf.rows()) {
        const category = row.categorical("Category").formattedValue() ?? "";
        const value = row.continuous("Value").value<number>() ?? 0;
        const color = row.color()?.hexCode ?? "#4a90e2";
        data.push({ category, value, color, row });
    }

    const width = (await layer.property("ColumnWidth")).value<number>() ?? 0;
    const innerWidth = width - chartMargin * 2;
    const innerHeight = rowHeight - chartMargin * 2;
    if (innerWidth <= 0 || innerHeight <= 0 || data.length === 0) {
        return;
    }

    const svg = select(cell)
        .append("svg")
        .attr("width", width)
        .attr("height", rowHeight)
        .append("g")
        .attr("transform", `translate(${chartMargin}, ${chartMargin})`);
    const categories = [...new Set(data.map((entry) => entry.category))];
    const xScale = scaleBand().domain(categories).range([0, innerWidth]).padding(0.2);

    const stackedData: { category: string; value: number; color: string; row: Spotfire.DataViewRow; y0: number; y1: number }[] = [];
    const positiveCumulative = new Map<string, number>();
    const negativeCumulative = new Map<string, number>();

    for (const entry of data) {
        const { category, value } = entry;
        if (value >= 0) {
            const y0 = positiveCumulative.get(category) ?? 0;
            const y1 = y0 + value;
            positiveCumulative.set(category, y1);
            stackedData.push({ ...entry, y0, y1 });
        } else {
            const y1 = negativeCumulative.get(category) ?? 0;
            const y0 = y1 + value;
            negativeCumulative.set(category, y0);
            stackedData.push({ ...entry, y0, y1 });
        }
    }

    const minValue = Math.min(0, min(stackedData, (entry) => entry.y0) ?? 0);
    const maxValue = Math.max(0, max(stackedData, (entry) => entry.y1) ?? 0);
    const yScale = scaleLinear().domain([minValue, maxValue]).nice().range([innerHeight, 0]);

    svg.selectAll("rect")
        .data(stackedData)
        .enter()
        .append("rect")
        .attr("x", (entry) => xScale(entry.category) ?? 0)
        .attr("y", (entry) => yScale(entry.y1))
        .attr("width", xScale.bandwidth())
        .attr("height", (entry) => Math.abs(yScale(entry.y0) - yScale(entry.y1)))
        .attr("fill", (entry) => {
            return entry.color;
        })
        .style("cursor", "pointer")
        .on("click", function (event, entry) {
            if (event.ctrlKey) {
                entry.row.mark("ToggleOrAdd");
            } else {
                entry.row.mark("Replace");
            }
        })
        .on("mouseover", function (event, entry) {
            select(this).attr("opacity", 1);
            mod.controls.tooltip.show(entry.row);
        })
        .on("mouseout", function () {
            select(this).attr("opacity", 0.85);
            mod.controls.tooltip.hide();
        });
}