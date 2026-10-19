import type { EChartsCoreOption } from 'echarts/core'

interface ChartTheme {
  text: string
  dim: string
  border: string
  panel: string
  accent: string
  ok: string
  warn: string
  err: string
}

function chartTheme(light: boolean): ChartTheme {
  if (light) {
    return {
      text: '#1f2937',
      dim: '#6b7280',
      border: '#e5e7eb',
      panel: '#ffffff',
      accent: '#4990e2',
      ok: '#49cc90',
      warn: '#fca130',
      err: '#f93e3e',
    }
  }
  return {
    text: '#d8d9da',
    dim: '#9fa7b3',
    border: '#2c3235',
    panel: '#181b1f',
    accent: '#ff8833',
    ok: '#73bf69',
    warn: '#f2cc0c',
    err: '#f2495c',
  }
}

function grid(theme: ChartTheme) {
  return {
    left: 46,
    right: 16,
    top: 24,
    bottom: 28,
    containLabel: false,
    borderColor: theme.border,
  }
}

function axis(theme: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: theme.border } },
    axisTick: { show: false },
    axisLabel: { color: theme.dim, fontSize: 9 },
    splitLine: { lineStyle: { color: theme.border, type: 'dashed' as const } },
  }
}

export function latencyOption(labels: string[], values: number[], light: boolean): EChartsCoreOption {
  const theme = chartTheme(light)
  return {
    backgroundColor: 'transparent',
    animationDurationUpdate: 600,
    grid: grid(theme),
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.panel,
      borderColor: theme.border,
      textStyle: { color: theme.text, fontSize: 10 },
    },
    xAxis: { type: 'category', data: labels, ...axis(theme), splitLine: { show: false } },
    yAxis: {
      type: 'value',
      min: 0,
      max: 3000,
      name: 'ms',
      nameTextStyle: { color: theme.dim, fontSize: 9 },
      ...axis(theme),
    },
    series: [
      {
        name: 'P95 耗时',
        type: 'line',
        data: values,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1.5, color: theme.accent },
        areaStyle: { color: theme.accent, opacity: 0.12 },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { color: theme.warn, fontSize: 8, formatter: 'SLO 800ms' },
          lineStyle: { color: theme.warn, type: 'dashed', width: 1 },
          data: [{ yAxis: 800 }],
        },
      },
    ],
  }
}

export function qpsOption(labels: string[], values: number[], light: boolean): EChartsCoreOption {
  const theme = chartTheme(light)
  return {
    backgroundColor: 'transparent',
    animationDurationUpdate: 500,
    grid: grid(theme),
    tooltip: {
      trigger: 'axis',
      backgroundColor: theme.panel,
      borderColor: theme.border,
      textStyle: { color: theme.text, fontSize: 10 },
    },
    xAxis: { type: 'category', data: labels, ...axis(theme), splitLine: { show: false } },
    yAxis: {
      type: 'value',
      name: 'req/s',
      nameTextStyle: { color: theme.dim, fontSize: 9 },
      ...axis(theme),
    },
    series: [
      {
        name: 'QPS',
        type: 'bar',
        barWidth: '58%',
        data: values.map((value) => ({
          value,
          itemStyle: {
            color: value > 900 ? theme.err : value > 600 ? theme.warn : theme.ok,
            borderRadius: [2, 2, 0, 0],
          },
        })),
      },
    ],
  }
}

export function diskOption(usage: number, light: boolean): EChartsCoreOption {
  const theme = chartTheme(light)
  return {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        radius: '92%',
        center: ['50%', '56%'],
        axisLine: {
          lineStyle: {
            width: 14,
            color: [[1, theme.border]],
          },
        },
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color: usage > 80 ? theme.err : usage > 65 ? theme.warn : theme.ok },
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '6%'],
          fontSize: 24,
          fontWeight: 600,
          color: theme.text,
          formatter: '{value}%',
        },
        data: [{ value: usage }],
      },
    ],
  }
}

export function topologyOption(light: boolean): EChartsCoreOption {
  const theme = chartTheme(light)
  const nodes = [
    { name: 'gateway', x: 300, y: 120, symbolSize: 30, category: 0 },
    { name: 'user', x: 140, y: 220, symbolSize: 24, category: 1 },
    { name: 'chat', x: 260, y: 250, symbolSize: 24, category: 1 },
    { name: 'reader', x: 400, y: 260, symbolSize: 24, category: 1 },
    { name: 'game', x: 510, y: 200, symbolSize: 24, category: 1 },
    { name: 'music', x: 490, y: 80, symbolSize: 24, category: 1 },
    { name: 'redis', x: 180, y: 90, symbolSize: 20, category: 2 },
    { name: 'mysql', x: 370, y: 60, symbolSize: 20, category: 2 },
  ]
  const categories = [
    { name: '入口', itemStyle: { color: theme.accent } },
    { name: '服务', itemStyle: { color: theme.ok } },
    { name: '中间件', itemStyle: { color: theme.warn } },
  ]
  const links = [
    ['gateway', 'user'],
    ['gateway', 'chat'],
    ['gateway', 'reader'],
    ['gateway', 'game'],
    ['gateway', 'music'],
    ['user', 'redis'],
    ['chat', 'redis'],
    ['chat', 'mysql'],
    ['reader', 'mysql'],
    ['game', 'redis'],
    ['music', 'redis'],
  ].map(([source, target]) => ({ source, target }))
  return {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: theme.panel,
      borderColor: theme.border,
      textStyle: { color: theme.text, fontSize: 10 },
    },
    series: [
      {
        type: 'graph',
        layout: 'none',
        roam: false,
        categories,
        data: nodes,
        links,
        label: { show: true, color: theme.dim, fontSize: 9, position: 'bottom' },
        lineStyle: { color: theme.border, width: 1.2, curveness: 0.05 },
        emphasis: { focus: 'adjacency', lineStyle: { color: theme.accent } },
      },
    ],
  }
}

export function heatmapOption(data: number[][], light: boolean): EChartsCoreOption {
  const theme = chartTheme(light)
  const hours = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`)
  const services = ['gateway', 'chat', 'reader', 'game', 'music', 'agent']
  return {
    backgroundColor: 'transparent',
    animationDurationUpdate: 500,
    grid: { left: 58, right: 14, top: 16, bottom: 42 },
    tooltip: {
      position: 'top',
      backgroundColor: theme.panel,
      borderColor: theme.border,
      textStyle: { color: theme.text, fontSize: 10 },
    },
    xAxis: {
      type: 'category',
      data: hours,
      ...axis(theme),
      splitLine: { show: false },
      axisLabel: { color: theme.dim, fontSize: 8, interval: 3 },
    },
    yAxis: {
      type: 'category',
      data: services,
      ...axis(theme),
      splitLine: { show: false },
    },
    visualMap: {
      min: 0,
      max: 900,
      show: false,
      inRange: { color: [theme.border, theme.panel, theme.accent, theme.warn, theme.err] },
    },
    series: [
      {
        name: '日志量',
        type: 'heatmap',
        data,
        itemStyle: { borderColor: theme.panel, borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.4)' } },
      },
    ],
  }
}
