import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Stats {
  mttrMinutes: number;
  slaRate: number;
  incidentVolume: { name: string; count: number }[];
  problemRatio: number;
  totalIncidents: number;
  totalProblems: number;
  byStatus: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#9ca3af',
  IN_PROGRESS: '#3b82f6',
  RESOLVED: '#10b981',
  CLOSED: '#6b7280',
};

const BAR_COLOR = '#3b82f6';
const BAR_HOVER = '#2563eb';

export const Dashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const barRef = useRef<SVGSVGElement>(null);
  const pieRef = useRef<SVGSVGElement>(null);
  const barTooltipRef = useRef<HTMLDivElement>(null);
  const pieTooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/reports/stats')
      .then((r) => r.json())
      .then(setStats);
  }, []);

  useEffect(() => {
    if (!stats || !barRef.current) return;

    const svg = d3.select(barRef.current);
    const tooltip = d3.select(barTooltipRef.current);
    svg.selectAll('*').remove();

    const data = stats.incidentVolume;
    if (data.length === 0) return;

    const margin = { top: 10, right: 20, bottom: 70, left: 40 };
    const width = barRef.current.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(data.map((d) => d.name)).range([0, width]).padding(0.3);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.count) || 1]).nice().range([height, 0]);

    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-25)')
      .style('text-anchor', 'end')
      .style('font-size', '10px');

    g.append('g').call(d3.axisLeft(y).ticks(5)).selectAll('text').style('font-size', '10px');

    g.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => x(d.name)!)
      .attr('width', x.bandwidth())
      .attr('y', height)
      .attr('height', 0)
      .attr('fill', BAR_COLOR)
      .attr('rx', 4)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('fill', BAR_HOVER);
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.name}</strong><br/>${d.count} інцидентів`)
          .style('left', event.offsetX + 10 + 'px')
          .style('top', event.offsetY - 30 + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill', BAR_COLOR);
        tooltip.style('opacity', 0);
      })
      .transition()
      .duration(600)
      .attr('y', (d) => y(d.count))
      .attr('height', (d) => height - y(d.count));
  }, [stats]);

  useEffect(() => {
    if (!stats || !pieRef.current) return;

    const svg = d3.select(pieRef.current);
    svg.selectAll('*').remove();

    const data = Object.entries(stats.byStatus).map(([name, value]) => ({ name, value }));
    if (data.length === 0) return;

    const width = pieRef.current.clientWidth;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 10;

    const g = svg
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    const color = d3
      .scaleOrdinal<string>()
      .domain(data.map((d) => d.name))
      .range(data.map((d) => STATUS_COLORS[d.name] || '#6b7280'));

    const pie = d3.pie<{ name: string; value: number }>().value((d) => d.value);
    const arc = d3.arc<d3.PieArcDatum<{ name: string; value: number }>>()
      .innerRadius(55)
      .outerRadius(radius);

    const tooltip = d3.select(pieTooltipRef.current);

    g.selectAll('path')
      .data(pie(data))
      .enter()
      .append('path')
      .attr('d', arc as any)
      .attr('fill', (d) => color(d.data.name))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .on('mouseover', function (event, d) {
        d3.select(this).attr('opacity', 0.8);
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.data.name}</strong><br/>${d.data.value} тікетів`)
          .style('left', event.offsetX + 10 + 'px')
          .style('top', event.offsetY - 30 + 'px');
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1);
        tooltip.style('opacity', 0);
      })
      .transition()
      .duration(500)
      .attrTween('d', function (d) {
        const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t) => arc(i(t) as any) || '';
      });

    // legend
    const legend = svg
      .append('g')
      .attr('transform', `translate(${width / 2 + radius + 16},${-radius})`);

    data.forEach((d, i) => {
      const row = legend.append('g').attr('transform', `translate(0,${i * 20})`);
      row
        .append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('rx', 2)
        .attr('fill', color(d.name));
      row
        .append('text')
        .attr('x', 18)
        .attr('y', 10)
        .style('font-size', '11px')
        .style('fill', '#374151')
        .text(`${d.name}: ${d.value}`);
    });
  }, [stats]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Завантаження...</div>
      </div>
    );
  }

  const formatMttr = (min: number) => {
    if (min < 60) return `${min} хв`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h} год ${m} хв` : `${h} год`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">MTTR (середній час ремонту)</div>
          <div className="text-2xl font-bold text-blue-600">
            {formatMttr(stats.mttrMinutes)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">SLA Compliance</div>
          <div className="text-2xl font-bold text-green-600">{stats.slaRate}%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">Всього інцидентів</div>
          <div className="text-2xl font-bold text-gray-800">{stats.totalIncidents}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="text-sm text-gray-500 mb-1">Problem/Incident Ratio</div>
          <div className="text-2xl font-bold text-purple-600">{stats.problemRatio}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5 relative">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Інциденти за сервісами
          </h3>
          <div ref={barTooltipRef} className="absolute pointer-events-none opacity-0 bg-gray-800 text-white text-xs rounded px-2 py-1 z-10 transition-opacity" />
          {stats.incidentVolume.length > 0 ? (
            <svg ref={barRef} width="100%" height="300" />
          ) : (
            <div className="text-gray-400 text-sm py-8 text-center">Немає даних</div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-5 relative">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            Розподіл за статусами
          </h3>
          <div ref={pieTooltipRef} className="absolute pointer-events-none opacity-0 bg-gray-800 text-white text-xs rounded px-2 py-1 z-10 transition-opacity" />
          {Object.keys(stats.byStatus).length > 0 ? (
            <svg ref={pieRef} width="100%" height="300" />
          ) : (
            <div className="text-gray-400 text-sm py-8 text-center">Немає даних</div>
          )}
        </div>
      </div>
    </div>
  );
};
