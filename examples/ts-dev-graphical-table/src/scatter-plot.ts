import { extent, scaleLinear, select } from "d3";

export async function renderScatterPlot(mod: Spotfire.Mod, cell: HTMLDivElement, layer: Spotfire.ModLayer, leafIndex: number, rowHeight: number) {
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
    const data: { x: number; y: number; color: string; row: Spotfire.DataViewRow }[] = [];
    for (const row of leaf.rows()) {
        const x = row.continuous("X").value<number>() ?? 0;
        const y = row.continuous("Y").value<number>() ?? 0;
        const color = row.color()?.hexCode ?? "#4a90e2";
        data.push({ x, y, color, row });
    }

    const width = (await layer.property("ColumnWidth")).value<number>() ?? 0;
    const innerWidth = width - chartMargin * 2;
    const innerHeight = rowHeight - chartMargin * 2;
    if (innerWidth <= 0 || innerHeight <= 0 || data.length === 0) {
        return;
    }

    const [minX = 0, maxX = 0] = extent(data, (entry) => entry.x);
    const [minY = 0, maxY = 0] = extent(data, (entry) => entry.y);

    const xDomainPadding = minX === maxX ? Math.max(Math.abs(minX) * 0.1, 1) : (maxX - minX) * 0.05;
    const yDomainPadding = minY === maxY ? Math.max(Math.abs(minY) * 0.1, 1) : (maxY - minY) * 0.05;

    const xScale = scaleLinear()
        .domain([minX - xDomainPadding, maxX + xDomainPadding])
        .range([0, innerWidth]);

    const yScale = scaleLinear()
        .domain([minY - yDomainPadding, maxY + yDomainPadding])
        .range([innerHeight, 0]);

    const svg = select(cell)
        .append("svg")
        .attr("width", width)
        .attr("height", rowHeight)
        .append("g")
        .attr("transform", `translate(${chartMargin}, ${chartMargin})`);

    svg.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", (entry) => xScale(entry.x))
        .attr("cy", (entry) => yScale(entry.y))
        .attr("r", 3)
        .attr("fill", (entry) => entry.color)
        .attr("opacity", 0.85)
        .style("cursor", "pointer")
        .on("click", function (event, entry) {
            if (event.ctrlKey) {
                entry.row.mark("ToggleOrAdd");
            } else {
                entry.row.mark("Replace");
            }
        })
        .on("mouseover", function (_event, entry) {
            select(this)
                .attr("opacity", 1)
                .attr("stroke", "#1f1f1f")
                .attr("stroke-width", 1);
            mod.controls.tooltip.show(entry.row);
        })
        .on("mouseout", function () {
            select(this)
                .attr("opacity", 0.85)
                .attr("stroke", null)
                .attr("stroke-width", null);
            mod.controls.tooltip.hide();
        });
}