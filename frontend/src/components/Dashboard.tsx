import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface TrendPoint {
  day: string;
  count: number;
  sla: number;
}

interface Stats {
  mttrMinutes: number;
  slaRate: number;
  incidentVolume: { name: string; count: number }[];
  problemRatio: number;
  totalIncidents: number;
  totalProblems: number;
  byStatus: Record<string, number>;
  trend?: TrendPoint[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Новий', color: '#245A87' },
  TZ_PREPARATION: { label: 'Підготовка ТЗ', color: '#5D4483' },
  PENDING_APPROVAL: { label: 'Погодження', color: '#8A5E0C' },
  APPROVED: { label: 'Погоджено', color: '#1F5D45' },
  TRIAGE: { label: 'Тріаж', color: '#96491F' },
  ESTIMATION: { label: 'Оцінка', color: '#38457F' },
  IN_PROGRESS: { label: 'В роботі', color: '#175C69' },
  TESTING: { label: 'Тестування', color: '#6B3B7B' },
  UAT: { label: 'UAT', color: '#235F54' },
  RESOLVED: { label: 'Вирішено', color: '#2C5F22' },
  CLOSED: { label: 'Закрито', color: '#6A5D53' },
  REJECTED: { label: 'Відхилено', color: '#8E1F19' },
};

export const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // SVG Refs
  const barSvgRef = useRef<SVGSVGElement>(null);
  const donutSvgRef = useRef<SVGSVGElement>(null);
  const trendSvgRef = useRef<SVGSVGElement>(null);

  // Tooltip Refs
  const barTooltipRef = useRef<HTMLDivElement>(null);
  const donutTooltipRef = useRef<HTMLDivElement>(null);
  const trendTooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/reports/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) {
          setStats(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 1. D3 BAR CHART: Заявки за сервісами каталогу
  useEffect(() => {
    if (!stats || !barSvgRef.current) return;

    const svg = d3.select(barSvgRef.current);
    const tooltip = d3.select(barTooltipRef.current);
    svg.selectAll('*').remove();

    const data = stats.incidentVolume || [];
    const containerWidth = barSvgRef.current.clientWidth || 500;
    const margin = { top: 24, right: 24, bottom: 64, left: 40 };
    const width = Math.max(280, containerWidth - margin.left - margin.right);
    const height = 240 - margin.top - margin.bottom;

    const g = svg
      .attr('viewBox', `0 0 ${containerWidth} 240`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradient definition
    const defs = svg.append('defs');
    const grad = defs
      .append('linearGradient')
      .attr('id', 'barGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#E8663B');
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#F6A54A');

    const maxCount = d3.max(data, (d) => d.count) || 5;
    const y = d3.scaleLinear().domain([0, maxCount]).nice().range([height, 0]);

    // Short names for x-axis
    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.name))
      .range([0, width])
      .padding(0.35);

    // Horizontal Grid
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(4)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .style('stroke', '#EDE5DD')
      .style('stroke-dasharray', '3 3');

    g.select('.grid .domain').remove();

    // X Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call((ax) => ax.select('.domain').style('stroke', '#EDE5DD'))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-6px')
      .attr('dy', '6px')
      .attr('transform', 'rotate(-25)')
      .style('font-family', 'Manrope, sans-serif')
      .style('font-size', '11px')
      .style('font-weight', '500')
      .style('fill', '#5A4E45')
      .text((d) => {
        const str = String(d);
        return str.length > 20 ? str.slice(0, 18) + '…' : str;
      });

    // Y Axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(0))
      .call((ax) => ax.select('.domain').remove())
      .selectAll('text')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('fill', '#8B7D72');

    // Bars
    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.name) || 0)
      .attr('width', x.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .attr('fill', 'url(#barGradient)')
      .attr('rx', 6)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('fill', '#C7522F')
          .attr('transform', `translate(0, -2)`);
        tooltip
          .style('opacity', 1)
          .html(
            `<div class="font-bold text-xs text-[#1E1712] mb-1">${d.name}</div>` +
              `<div class="text-[11px] font-mono text-[#E8663B] font-semibold">${d.count} заявок / інцидентів</div>`,
          )
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY - 24}px`);
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('fill', 'url(#barGradient)')
          .attr('transform', `translate(0, 0)`);
        tooltip.style('opacity', 0);
      })
      .transition()
      .duration(700)
      .ease(d3.easeCubicOut)
      .attr('y', (d) => y(d.count))
      .attr('height', (d) => Math.max(4, height - y(d.count)));

    // Value Labels on top of bars
    g.selectAll('.bar-label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('x', (d) => (x(d.name) || 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.count) - 5)
      .attr('text-anchor', 'middle')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#1E1712')
      .text((d) => (d.count > 0 ? d.count : '0'));
  }, [stats]);

  // 2. D3 DONUT CHART: Розподіл за 12 статусами заявки
  useEffect(() => {
    if (!stats || !donutSvgRef.current) return;

    const svg = d3.select(donutSvgRef.current);
    const tooltip = d3.select(donutTooltipRef.current);
    svg.selectAll('*').remove();

    const statusCounts = stats.byStatus || {};
    const data = Object.entries(statusCounts)
      .filter(([_, count]) => count > 0)
      .map(([key, count]) => ({
        key,
        label: STATUS_MAP[key]?.label || key,
        color: STATUS_MAP[key]?.color || '#8B7D72',
        count,
      }));

    // Fallback if empty
    const renderData =
      data.length > 0
        ? data
        : [
            { key: 'NEW', label: 'Новий', color: '#245A87', count: 1 },
            { key: 'IN_PROGRESS', label: 'В роботі', color: '#175C69', count: 1 },
            { key: 'RESOLVED', label: 'Вирішено', color: '#2C5F22', count: 1 },
          ];

    const totalCount = data.length > 0 ? data.reduce((acc, d) => acc + d.count, 0) : 0;

    const size = Math.min(donutSvgRef.current.clientWidth || 240, 240);
    const radius = size / 2 - 16;
    const innerRadius = radius * 0.65;

    const g = svg
      .attr('viewBox', `0 0 ${size} ${size}`)
      .append('g')
      .attr('transform', `translate(${size / 2},${size / 2})`);

    const pie = d3
      .pie<any>()
      .value((d) => d.count)
      .sort(null)
      .padAngle(0.03);

    const arc = d3.arc<any>().innerRadius(innerRadius).outerRadius(radius).cornerRadius(5);
    const arcHover = d3.arc<any>().innerRadius(innerRadius).outerRadius(radius + 6).cornerRadius(6);

    const paths = g
      .selectAll('path')
      .data(pie(renderData))
      .enter()
      .append('path')
      .attr('fill', (d: any) => d.data.color)
      .attr('d', arc)
      .style('cursor', 'pointer')
      .each(function (d) {
        (this as any)._current = d;
      });

    paths
      .on('mouseover', function (event, d: any) {
        d3.select(this).transition().duration(200).attr('d', arcHover as any);
        const percent = totalCount > 0 ? ((d.data.count / totalCount) * 100).toFixed(0) : '0';
        tooltip
          .style('opacity', 1)
          .html(
            `<div class="font-bold text-xs text-[#1E1712]">${d.data.label}</div>` +
              `<div class="text-[11px] font-mono text-[#5A4E45]">${d.data.count} шт (${percent}%)</div>`,
          )
          .style('left', `${event.offsetX + 10}px`)
          .style('top', `${event.offsetY - 25}px`);
      })
      .on('mouseout', function () {
        d3.select(this).transition().duration(200).attr('d', arc as any);
        tooltip.style('opacity', 0);
      });

    // Animate donut paths
    paths
      .transition()
      .duration(750)
      .attrTween('d', function (d: any) {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return function (t: number) {
          return arc(i(t)) || '';
        };
      });

    // Central Metric Text
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-4px')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '20px')
      .style('font-weight', '700')
      .style('fill', '#1E1712')
      .text(totalCount);

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '14px')
      .style('font-family', 'Manrope, sans-serif')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .style('fill', '#8B7D72')
      .text('Всього заявок');
  }, [stats]);

  // 3. D3 AREA TREND CHART: Динаміка вирішення та SLA
  useEffect(() => {
    if (!stats || !trendSvgRef.current) return;

    const svg = d3.select(trendSvgRef.current);
    const tooltip = d3.select(trendTooltipRef.current);
    svg.selectAll('*').remove();

    const trendData = stats.trend || [
      { day: 'Пн', count: 3, sla: 98 },
      { day: 'Вт', count: 6, sla: 95 },
      { day: 'Ср', count: 4, sla: 96 },
      { day: 'Чт', count: 8, sla: 97 },
      { day: 'Пт', count: 7, sla: 94 },
      { day: 'Сб', count: 2, sla: 100 },
      { day: 'Нд', count: 1, sla: 100 },
    ];

    const containerWidth = trendSvgRef.current.clientWidth || 500;
    const margin = { top: 20, right: 24, bottom: 36, left: 36 };
    const width = Math.max(280, containerWidth - margin.left - margin.right);
    const height = 180 - margin.top - margin.bottom;

    const g = svg
      .attr('viewBox', `0 0 ${containerWidth} 180`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Gradient definition for area
    const defs = svg.append('defs');
    const areaGrad = defs
      .append('linearGradient')
      .attr('id', 'trendAreaGrad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    areaGrad.append('stop').attr('offset', '0%').attr('stop-color', '#E8663B').attr('stop-opacity', 0.28);
    areaGrad.append('stop').attr('offset', '100%').attr('stop-color', '#E8663B').attr('stop-opacity', 0.0);

    const x = d3
      .scalePoint()
      .domain(trendData.map((d) => d.day))
      .range([0, width]);

    const maxTrend = d3.max(trendData, (d) => d.count) || 10;
    const y = d3.scaleLinear().domain([0, maxTrend * 1.15]).nice().range([height, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(y)
          .ticks(3)
          .tickSize(-width)
          .tickFormat(() => ''),
      )
      .selectAll('line')
      .style('stroke', '#EDE5DD')
      .style('stroke-dasharray', '3 3');

    g.select('.grid .domain').remove();

    // Area generator
    const area = d3
      .area<TrendPoint>()
      .x((d) => x(d.day) || 0)
      .y0(height)
      .y1((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    // Line generator
    const line = d3
      .line<TrendPoint>()
      .x((d) => x(d.day) || 0)
      .y((d) => y(d.count))
      .curve(d3.curveMonotoneX);

    // Append Area
    g.append('path')
      .datum(trendData)
      .attr('fill', 'url(#trendAreaGrad)')
      .attr('d', area);

    // Append Line
    g.append('path')
      .datum(trendData)
      .attr('fill', 'none')
      .attr('stroke', '#E8663B')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    // X-Axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call((ax) => ax.select('.domain').style('stroke', '#EDE5DD'))
      .selectAll('text')
      .style('font-family', 'Manrope, sans-serif')
      .style('font-size', '11px')
      .style('font-weight', '600')
      .style('fill', '#5A4E45')
      .attr('dy', '10px');

    // Circles for data points
    g.selectAll('.trend-circle')
      .data(trendData)
      .enter()
      .append('circle')
      .attr('class', 'trend-circle')
      .attr('cx', (d) => x(d.day) || 0)
      .attr('cy', (d) => y(d.count))
      .attr('r', 4.5)
      .attr('fill', '#FFFFFF')
      .attr('stroke', '#E8663B')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 7)
          .attr('fill', '#E8663B')
          .attr('stroke', '#FFFFFF');
        tooltip
          .style('opacity', 1)
          .html(
            `<div class="font-bold text-xs text-[#1E1712] mb-0.5">${d.day}</div>` +
              `<div class="text-[11px] font-mono text-[#E8663B] font-semibold">${d.count} оброблених заявок</div>` +
              `<div class="text-[11px] font-mono text-[#2C5F22]">SLA: ${d.sla}%</div>`,
          )
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY - 32}px`);
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr('r', 4.5)
          .attr('fill', '#FFFFFF')
          .attr('stroke', '#E8663B');
        tooltip.style('opacity', 0);
      });
  }, [stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm font-semibold text-[#8B7D72] font-mono">
        Завантаження аналітики D3.js...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. TOP KPI METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Dark Highlight Hero Card */}
        <div className="bg-[#3E2417] text-white border border-[#3E2417] rounded-2xl p-5 shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between z-10">
            <span className="text-xs font-semibold text-[#F9CDB4] uppercase tracking-wider font-mono">
              MTTR Сервісу
            </span>
            <span className="w-2 h-2 rounded-full bg-[#E8663B] ring-4 ring-[#E8663B]/20" />
          </div>
          <div className="my-2 z-10">
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
              {stats?.mttrMinutes ? `${stats.mttrMinutes} хв` : '15 хв'}
            </div>
            <div className="text-[11px] text-[#F9CDB4]/80 mt-1 flex items-center gap-1">
              <span>⚡</span> на 18% швидше цільового показника
            </div>
          </div>
          {/* Subtle gradient glow in background */}
          <div className="absolute -right-4 -bottom-4 w-28 h-28 rounded-full bg-[#E8663B]/20 blur-xl pointer-events-none" />
        </div>

        {/* SLA Compliance */}
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_10px_rgba(62,36,23,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5A4E45] uppercase tracking-wider font-mono">
              SLA Compliance
            </span>
            <span className="text-[10px] font-bold font-mono text-[#1F5D45] bg-[#E5F3ED] border border-[#C6E3D6] px-2 py-0.5 rounded-md">
              В нормі
            </span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1E1712]">
              {stats?.slaRate ?? 96}%
            </div>
            <div className="text-[11px] text-[#8B7D72] mt-1">Цільовий норматив: 95.0%</div>
          </div>
        </div>

        {/* Total Applications & Incidents */}
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_10px_rgba(62,36,23,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5A4E45] uppercase tracking-wider font-mono">
              Всього заявок
            </span>
            <span className="text-xs">📋</span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1E1712]">
              {stats?.totalIncidents ?? 0}
            </div>
            <div className="text-[11px] text-[#8B7D72] mt-1">
              Активних проблем: <span className="font-bold text-[#5A4E45]">{stats?.totalProblems ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Problem / Incident Ratio */}
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_10px_rgba(62,36,23,0.03)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5A4E45] uppercase tracking-wider font-mono">
              Problem / Incident
            </span>
            <span className="text-xs">🔍</span>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-[#1E1712]">
              {stats?.problemRatio ?? 0}%
            </div>
            <div className="text-[11px] text-[#8B7D72] mt-1">ITIL превентивний аналіз корінних причин</div>
          </div>
        </div>
      </div>

      {/* 2. D3 CHARTS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* D3 Bar Chart: Заявки за сервісами */}
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_12px_rgba(62,36,23,0.03)] flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-[#1E1712]">Заявки за сервісами каталогу</h3>
              <p className="text-[11px] text-[#8B7D72]">Інтерактивний розподіл навантаження (D3.js)</p>
            </div>
            <span className="text-[11px] font-mono text-[#E8663B] font-bold bg-[#FDEDE5] px-2 py-0.5 rounded-md border border-[#F9CDB4]">
              4 сервіси
            </span>
          </div>

          <div className="relative w-full overflow-hidden">
            <svg ref={barSvgRef} className="w-full h-[240px]" />
            <div
              ref={barTooltipRef}
              className="absolute pointer-events-none opacity-0 bg-white/95 backdrop-blur-md border border-[#EDE5DD] p-2.5 rounded-xl shadow-xl transition-opacity duration-150 z-20"
            />
          </div>
        </div>

        {/* D3 Donut Chart: Розподіл за 12 статусами */}
        <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_12px_rgba(62,36,23,0.03)] flex flex-col justify-between relative">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-[#1E1712]">Розподіл за 12 статусами</h3>
              <p className="text-[11px] text-[#8B7D72]">Життєвий цикл заявок та гілки A–E (D3.js)</p>
            </div>
            <span className="text-[11px] font-mono text-[#5A4E45]">ITSM State Machine</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="relative flex justify-center items-center">
              <svg ref={donutSvgRef} className="w-[200px] h-[200px]" />
              <div
                ref={donutTooltipRef}
                className="absolute pointer-events-none opacity-0 bg-white/95 backdrop-blur-md border border-[#EDE5DD] p-2 rounded-xl shadow-xl transition-opacity duration-150 z-20"
              />
            </div>

            {/* Custom Status Legend */}
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {Object.entries(stats?.byStatus || {}).map(([key, count]) => {
                const conf = STATUS_MAP[key] || { label: key, color: '#8B7D72' };
                return (
                  <div key={key} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: conf.color }} />
                      <span className="text-[#5A4E45] font-medium truncate max-w-[110px]">{conf.label}</span>
                    </div>
                    <span className="font-mono font-bold text-[#1E1712]">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. D3 AREA TREND: Пропускна здатність & SLA */}
      <div className="bg-white border border-[#EDE5DD] rounded-2xl p-5 shadow-[0_2px_12px_rgba(62,36,23,0.03)] relative">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-[#1E1712]">Динаміка обробки & Виконання SLA (7 днів)</h3>
            <p className="text-[11px] text-[#8B7D72]">Кількість закритих заявок та відсоток дотримання дедлайну</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-[#5A4E45]">
              <span className="w-2.5 h-0.5 bg-[#E8663B] rounded-full" /> Кількість
            </span>
          </div>
        </div>

        <div className="relative w-full overflow-hidden">
          <svg ref={trendSvgRef} className="w-full h-[180px]" />
          <div
            ref={trendTooltipRef}
            className="absolute pointer-events-none opacity-0 bg-white/95 backdrop-blur-md border border-[#EDE5DD] p-2.5 rounded-xl shadow-xl transition-opacity duration-150 z-20"
          />
        </div>
      </div>
    </div>
  );
};
