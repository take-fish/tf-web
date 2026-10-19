<script setup lang="ts">
interface CodePart {
  text: string
  kind?: 'kw' | 'type' | 'str' | 'num' | 'com' | 'fn' | 'ann'
}

interface CodeLine {
  parts: CodePart[]
}

const CODE: CodeLine[] = [
  { parts: [{ text: 'package com.fishmatrix.vehicle;', kind: 'kw' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: 'import ', kind: 'kw' }, { text: 'com.fishmatrix.telemetry.MetricPublisher;', kind: 'type' }] },
  { parts: [{ text: 'import ', kind: 'kw' }, { text: 'org.springframework.stereotype.Service;', kind: 'type' }] },
  { parts: [{ text: 'import ', kind: 'kw' }, { text: 'java.util.List;', kind: 'type' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '/**', kind: 'com' }] },
  { parts: [{ text: ' * 车辆状态聚合服务。负责节点心跳与遥测数据汇总。', kind: 'com' }] },
  { parts: [{ text: ' * @author zhuanz', kind: 'com' }] },
  { parts: [{ text: ' */', kind: 'com' }] },
  { parts: [{ text: '@Service', kind: 'ann' }] },
  { parts: [{ text: 'public class ', kind: 'kw' }, { text: 'VehicleService', kind: 'type' }, { text: ' {' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '    private static final ', kind: 'kw' }, { text: 'int', kind: 'type' }, { text: ' MAX_RETRY = ', }, { text: '3', kind: 'num' }, { text: ';' }] },
  { parts: [{ text: '    private static final ', kind: 'kw' }, { text: 'long', kind: 'type' }, { text: ' HEARTBEAT_TTL_MS = ', }, { text: '30_000L', kind: 'num' }, { text: ';' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '    private final ', kind: 'kw' }, { text: 'MetricPublisher', kind: 'type' }, { text: ' metricPublisher;' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '    public ', kind: 'kw' }, { text: 'VehicleService', kind: 'fn' }, { text: '(MetricPublisher metricPublisher) {' }] },
  { parts: [{ text: '        this.metricPublisher = metricPublisher;' }] },
  { parts: [{ text: '    }' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '    public ', kind: 'kw' }, { text: 'List<VehicleSnapshot>', kind: 'type' }, { text: ' collectActives() {' }] },
  { parts: [{ text: '        return metricPublisher.snapshot()' }] },
  { parts: [{ text: '                .filter(', kind: 'fn' }, { text: 'entry', }, { text: ' -> entry.lastSeen() < HEARTBEAT_TTL_MS', }] },
  { parts: [{ text: '                .map(', kind: 'fn' }, { text: 'VehicleSnapshot::of', kind: 'fn' }, { text: ')' }] },
  { parts: [{ text: '                .toList();' }] },
  { parts: [{ text: '    }' }] },
  { parts: [{ text: '' }] },
  { parts: [{ text: '    public ', kind: 'kw' }, { text: 'int', kind: 'type' }, { text: ' retryBudget(', }, { text: 'String', kind: 'type' }, { text: ' nodeId) {' }] },
  { parts: [{ text: '        int budget = 0;' }] },
  { parts: [{ text: '        while (budget < MAX_RETRY && nodeId != null) {' }] },
  { parts: [{ text: '            budget++;' }] },
  { parts: [{ text: '        }' }] },
  { parts: [{ text: '        return budget;' }] },
  { parts: [{ text: '    }' }] },
  { parts: [{ text: '}' }] },
]

const BUILD_LOG = [
  '[INFO] Scanning for projects...',
  '[INFO] Building fishmatrix-api 0.8.4-SNAPSHOT',
  '[INFO] --- maven-compiler-plugin:3.13.0:compile ---',
  '[INFO] Compiling 42 source files to target/classes',
  '[INFO] BUILD SUCCESS',
]
</script>

<template>
  <div class="boss-screen" aria-label="开发工作台">
    <div class="boss-menubar">
      <span class="boss-logo">⌘</span>
      <span>文件</span><span>编辑</span><span>选择</span><span>查看</span><span>转到</span>
      <span>运行</span><span>终端</span><span>帮助</span>
      <span class="boss-menubar__spacer" />
      <span class="boss-project">fishmatrix-api</span>
    </div>

    <div class="boss-body">
      <div class="boss-activity">
        <span class="is-active">▤</span>
        <span>⌕</span>
        <span>⑂</span>
        <span>▷</span>
        <span>▦</span>
        <span class="boss-activity__spacer" />
        <span>◔</span>
        <span>⚙</span>
      </div>

      <div class="boss-explorer">
        <div class="boss-explorer__head">资源管理器 <span>⋯</span></div>
        <div class="boss-tree">
          <div class="boss-tree__root">▾ FM-FISHMATRIX-API</div>
          <div class="boss-tree__row">▾ src</div>
          <div class="boss-tree__row boss-tree__row--indent">▾ main</div>
          <div class="boss-tree__row boss-tree__row--indent2">▾ java</div>
          <div class="boss-tree__row boss-tree__row--indent3">▾ com.fishmatrix.vehicle</div>
          <div class="boss-tree__row boss-tree__row--indent4 is-active">
            <span class="boss-java">J</span> VehicleService.java
          </div>
          <div class="boss-tree__row boss-tree__row--indent4">
            <span class="boss-java">J</span> VehicleController.java
          </div>
          <div class="boss-tree__row boss-tree__row--indent4">
            <span class="boss-java">J</span> VehicleSnapshot.java
          </div>
          <div class="boss-tree__row boss-tree__row--indent3">▸ com.fishmatrix.telemetry</div>
          <div class="boss-tree__row boss-tree__row--indent3">▸ com.fishmatrix.config</div>
          <div class="boss-tree__row boss-tree__row--indent2">▾ resources</div>
          <div class="boss-tree__row boss-tree__row--indent3">⚙ application.yml</div>
          <div class="boss-tree__row boss-tree__row--indent">▾ test</div>
          <div class="boss-tree__row">⚙ pom.xml</div>
        </div>
        <div class="boss-outline">大纲</div>
        <div class="boss-outline__list">
          <span>◈ MAX_RETRY</span>
          <span>◈ HEARTBEAT_TTL_MS</span>
          <span>◈ collectActives()</span>
          <span>◈ retryBudget(String)</span>
        </div>
      </div>

      <div class="boss-editor">
        <div class="boss-tabs">
          <span class="is-active">
            <span class="boss-java">J</span> VehicleService.java <em>×</em>
          </span>
          <span><span class="boss-java">J</span> VehicleController.java</span>
          <span>application.yml</span>
          <span class="boss-tabs__spacer" />
        </div>
        <div class="boss-breadcrumb">com › fishmatrix › vehicle › <b>VehicleService.java</b> › VehicleService</div>
        <div class="boss-code">
          <div v-for="(line, index) in CODE" :key="index" class="boss-code__line">
            <span class="boss-code__no">{{ index + 1 }}</span>
            <code>
              <span
                v-for="(part, partIndex) in line.parts"
                :key="partIndex"
                :class="part.kind ? `tok-${part.kind}` : undefined"
                >{{ part.text }}</span
              >
            </code>
          </div>
        </div>
        <div class="boss-panel">
          <div class="boss-panel__head">
            <span class="is-active">终端</span>
            <span>问题</span>
            <span>输出</span>
            <span>调试控制台</span>
            <span class="boss-panel__spacer" />
            <span>bash</span>
          </div>
          <div class="boss-panel__log">
            <div v-for="line in BUILD_LOG" :key="line" class="boss-panel__line">
              <span class="boss-panel__prompt">fishmatrix-api</span> {{ line }}
            </div>
            <div class="boss-panel__line">
              <span class="boss-panel__prompt">fishmatrix-api</span> <span class="boss-cursor">▍</span>
            </div>
          </div>
        </div>
      </div>

      <div class="boss-minimap" aria-hidden="true">
        <span v-for="(line, index) in CODE" :key="index" :style="{ opacity: 0.12 + ((index % 5) * 0.05) }" />
      </div>
    </div>

    <div class="boss-status">
      <span>⑂ main*</span>
      <span>⊗ 0</span><span>△ 0</span>
      <span class="boss-status__spacer" />
      <span>Ln 34, Col 9</span>
      <span>UTF-8</span><span>Java</span>
      <span class="boss-status__ok">● 已连接</span>
      <span>FishMatrix API</span>
    </div>
  </div>
</template>

<style scoped>
.boss-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #cccccc;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
}

.boss-menubar {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 30px;
  padding: 0 10px;
  background: #323233;
  font-size: 12px;
  color: #cccccc;
}
.boss-logo { color: #007acc; font-size: 16px; }
.boss-menubar__spacer { flex: 1; }
.boss-project { color: #8b949e; font-size: 11px; }

.boss-body { flex: 1; display: flex; min-height: 0; }
.boss-activity {
  width: 48px;
  background: #333333;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 12px 0;
  font-size: 18px;
  color: #868686;
}
.boss-activity .is-active { color: #ffffff; border-left: 2px solid #007acc; padding-left: 8px; margin-left: -8px; }
.boss-activity__spacer { flex: 1; }

.boss-explorer {
  width: 250px;
  background: #252526;
  border-right: 1px solid #2b2b2b;
  padding: 8px 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.boss-explorer__head {
  display: flex;
  justify-content: space-between;
  padding: 2px 12px 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #bbbbbb;
}
.boss-tree { font-size: 12px; line-height: 22px; color: #cccccc; }
.boss-tree__root { padding-left: 10px; font-size: 11px; color: #bbbbbb; letter-spacing: 0.04em; margin-bottom: 3px; }
.boss-tree__row { padding-left: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.boss-tree__row--indent { padding-left: 34px; }
.boss-tree__row--indent2 { padding-left: 46px; }
.boss-tree__row--indent3 { padding-left: 58px; }
.boss-tree__row--indent4 { padding-left: 70px; }
.boss-tree__row.is-active { background: #37373d; color: #ffffff; }
.boss-java { display: inline-block; margin-right: 5px; color: #e0a35d; font-weight: 600; font-size: 11px; }
.boss-outline { margin-top: 14px; padding: 4px 12px; font-size: 11px; letter-spacing: 0.05em; color: #bbbbbb; border-top: 1px solid #2f2f2f; }
.boss-outline__list { display: flex; flex-direction: column; gap: 2px; padding: 4px 20px; font-size: 12px; color: #b8b8b8; }

.boss-editor { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.boss-tabs {
  display: flex;
  align-items: stretch;
  height: 35px;
  background: #2d2d2d;
  font-size: 12px;
}
.boss-tabs > span {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-right: 1px solid #252526;
  color: #9d9d9d;
}
.boss-tabs > span.is-active { background: #1e1e1e; color: #ffffff; border-top: 1px solid #007acc; }
.boss-tabs em { font-style: normal; color: #777; }
.boss-tabs__spacer { flex: 1; border-right: 0 !important; }
.boss-breadcrumb { padding: 5px 16px; font-size: 11px; color: #8f8f8f; background: #1e1e1e; border-bottom: 1px solid #2a2a2a; }
.boss-breadcrumb b { color: #cccccc; font-weight: 500; }

.boss-code {
  flex: 1;
  overflow: hidden;
  padding: 12px 0 8px;
  font-family: 'Cascadia Mono', 'JetBrains Mono', Consolas, monospace;
  font-size: 13px;
  line-height: 20px;
  background: #1e1e1e;
}
.boss-code__line { display: flex; gap: 16px; padding: 0 14px; white-space: pre; }
.boss-code__line:nth-child(12) { background: #262626; }
.boss-code__no { width: 22px; text-align: right; color: #6e7681; user-select: none; flex: none; }
.boss-code code { font-family: inherit; }
.tok-kw { color: #c586c0; }
.tok-type { color: #4ec9b0; }
.tok-str { color: #ce9178; }
.tok-num { color: #b5cea8; }
.tok-com { color: #6a9955; }
.tok-fn { color: #dcdcaa; }
.tok-ann { color: #dcdcaa; }

.boss-panel {
  height: 150px;
  border-top: 1px solid #2c2c2c;
  background: #1e1e1e;
  display: flex;
  flex-direction: column;
}
.boss-panel__head {
  display: flex;
  gap: 18px;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  font-size: 11px;
  color: #9d9d9d;
  border-bottom: 1px solid #2c2c2c;
}
.boss-panel__head .is-active { color: #ffffff; border-bottom: 1px solid #007acc; height: 30px; display: flex; align-items: center; }
.boss-panel__spacer { flex: 1; }
.boss-panel__log { flex: 1; overflow: hidden; padding: 6px 14px; font-family: 'Cascadia Mono', Consolas, monospace; font-size: 12px; line-height: 19px; color: #bdbdbd; }
.boss-panel__prompt { color: #3fb950; }
.boss-cursor { color: #aeafad; animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }

.boss-minimap {
  width: 64px;
  background: #1e1e1e;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  border-left: 1px solid #252526;
}
.boss-minimap span { height: 3px; background: #8b949e; border-radius: 1px; }

.boss-status {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 24px;
  padding: 0 12px;
  background: #007acc;
  color: #ffffff;
  font-size: 11px;
}
.boss-status__spacer { flex: 1; }
.boss-status__ok { opacity: 0.9; }
</style>
