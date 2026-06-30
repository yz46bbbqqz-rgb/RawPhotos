<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { activeProvider } from '../store'
import { toast } from '../composables/useToast'
import Icon from './Icon.vue'

const usage = ref(null)
const loading = ref(false)

const quota = ref(null)
const quotaErr = ref('')
const quotaLoading = ref(false)

const provider = computed(() => activeProvider())

const KIND_CARDS = [
  { key: 'image', label: '图片', icon: 'image' },
  { key: 'video', label: '视频', icon: 'film' },
  { key: 'optimize', label: '提示词优化', icon: 'sparkle' },
  { key: 'chat', label: 'AI 对话', icon: 'chat' }
]

function kindCount(k) {
  return usage.value?.byKind?.[k] || 0
}

const totalReq = computed(() => (usage.value ? (usage.value.ok || 0) + (usage.value.fail || 0) : 0))
const okRate = computed(() => (totalReq.value ? Math.round(((usage.value.ok || 0) / totalReq.value) * 100) : 0))
const genTotal = computed(() => KIND_CARDS.reduce((s, c) => s + kindCount(c.key), 0))

const usedPct = computed(() => {
  const q = quota.value
  if (!q || q.total == null || !q.total || q.used == null) return null
  return Math.min(100, Math.max(0, Math.round((q.used / q.total) * 100)))
})

const days = computed(() => {
  const arr = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    arr.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, n: usage.value?.byDay?.[key] || 0 })
  }
  return arr
})
const maxDay = computed(() => Math.max(1, ...days.value.map((d) => d.n)))

const topModels = computed(() =>
  Object.entries(usage.value?.byModel || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
)
const maxModel = computed(() => Math.max(1, ...topModels.value.map((m) => m[1])))

function cleanErr(m) {
  return String(m || '').replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
}
function money(v) {
  if (v == null) return '—'
  const u = quota.value?.unit || 'USD'
  return u === 'USD' ? `$${Number(v).toFixed(2)}` : `${Number(v).toFixed(2)} ${u}`
}

async function refresh() {
  loading.value = true
  try {
    usage.value = await window.api.getUsage()
  } catch (err) {
    toast.error(`读取统计失败：${err.message}`)
  } finally {
    loading.value = false
  }
}

async function loadQuota() {
  quotaLoading.value = true
  quotaErr.value = ''
  try {
    const q = await window.api.getQuota()
    if (q && q.error) {
      quota.value = null
      quotaErr.value = q.error
    } else {
      quota.value = q
    }
  } catch (err) {
    quota.value = null
    quotaErr.value = cleanErr(err.message)
  } finally {
    quotaLoading.value = false
  }
}

function refreshAll() {
  refresh()
  loadQuota()
}

async function reset() {
  try {
    await window.api.resetUsage()
    await refresh()
    toast.success('本地统计已清零')
  } catch (err) {
    toast.error(`清零失败：${err.message}`)
  }
}

let timer = null
onMounted(() => {
  refresh()
  loadQuota()
  // 额度定时刷新（每 60s），别只跑一次
  timer = setInterval(() => {
    loadQuota()
    refresh()
  }, 60000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="view">
    <header class="view-head">
      <div class="head-title">
        <h1>用量统计</h1>
        <p class="sub">中转额度 + 本地累计调用</p>
      </div>
      <div class="head-actions">
        <button class="btn btn-sm" :disabled="loading || quotaLoading" @click="refreshAll">
          <span v-if="loading || quotaLoading" class="spin"></span>
          <Icon v-else name="refresh" :size="15" />
          <span>刷新</span>
        </button>
      </div>
    </header>

    <div class="scroll">
      <section class="card quota-card">
        <div class="quota-head">
          <div class="quota-head-l">
            <span class="quota-ic"><Icon name="plug" :size="18" /></span>
            <div>
              <div class="quota-title">中转额度</div>
              <div class="quota-prov">{{ provider?.name || '未配置接口' }}</div>
            </div>
          </div>
          <button class="btn btn-sm btn-ghost" :disabled="quotaLoading" @click="loadQuota">
            <span v-if="quotaLoading" class="spin"></span>
            <Icon v-else name="refresh" :size="14" />
            <span>查询</span>
          </button>
        </div>

        <template v-if="quota">
          <div class="quota-nums">
            <div class="qn">
              <div class="qn-num remain">{{ money(quota.remaining) }}</div>
              <div class="qn-label">剩余</div>
            </div>
            <div class="qn">
              <div class="qn-num">{{ money(quota.total) }}</div>
              <div class="qn-label">总额度</div>
            </div>
            <div class="qn">
              <div class="qn-num">{{ money(quota.used) }}</div>
              <div class="qn-label">已用</div>
            </div>
          </div>
          <div v-if="usedPct != null" class="quota-bar">
            <div class="quota-fill" :style="{ width: usedPct + '%' }"></div>
          </div>
          <div v-if="usedPct != null" class="quota-pct">已用 {{ usedPct }}%</div>
        </template>
        <div v-else-if="quotaLoading" class="quota-msg">正在查询额度…</div>
        <div v-else class="quota-msg">{{ quotaErr || '点击「查询」获取额度' }}</div>
      </section>

      <h3 class="section-h">本地累计用量</h3>
      <div class="kpi-grid">
        <div v-for="c in KIND_CARDS" :key="c.key" class="kpi">
          <span class="kpi-ic"><Icon :name="c.icon" :size="18" /></span>
          <div class="kpi-main">
            <div class="kpi-num">{{ kindCount(c.key) }}</div>
            <div class="kpi-label">{{ c.label }}</div>
          </div>
        </div>
      </div>

      <section class="card sum-card">
        <div class="sum-item">
          <div class="sum-num">{{ genTotal }}</div>
          <div class="sum-label">生成总数</div>
        </div>
        <div class="sum-item">
          <div class="sum-num">{{ totalReq }}</div>
          <div class="sum-label">总请求</div>
        </div>
        <div class="sum-item">
          <div class="sum-num ok">{{ usage?.ok || 0 }}</div>
          <div class="sum-label">成功</div>
        </div>
        <div class="sum-item">
          <div class="sum-num bad">{{ usage?.fail || 0 }}</div>
          <div class="sum-label">失败</div>
        </div>
        <div class="sum-item">
          <div class="sum-num">{{ okRate }}%</div>
          <div class="sum-label">成功率</div>
        </div>
      </section>

      <div class="two-col">
        <section class="card block">
          <h3 class="block-title">最近 7 天</h3>
          <div class="bars">
            <div v-for="d in days" :key="d.key" class="bar-col">
              <div class="bar-wrap">
                <div class="bar" :style="{ height: Math.round((d.n / maxDay) * 100) + '%' }">
                  <span v-if="d.n" class="bar-n">{{ d.n }}</span>
                </div>
              </div>
              <span class="bar-label">{{ d.label }}</span>
            </div>
          </div>
        </section>

        <section class="card block">
          <div class="block-title-row">
            <h3 class="block-title">按模型 Top</h3>
            <button class="btn btn-sm btn-ghost" @click="reset"><Icon name="trash" :size="13" /><span>清零</span></button>
          </div>
          <div v-if="topModels.length" class="models">
            <div v-for="[m, n] in topModels" :key="m" class="model-row">
              <span class="model-name" :title="m">{{ m }}</span>
              <div class="model-bar-wrap">
                <div class="model-bar" :style="{ width: Math.round((n / maxModel) * 100) + '%' }"></div>
              </div>
              <span class="model-n">{{ n }}</span>
            </div>
          </div>
          <p v-else class="empty-line">还没有数据，去生成几张试试。</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.view-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 30px 18px;
  border-bottom: 1px solid var(--border);
}
.head-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 20px 34px 40px;
  width: 100%;
}

.quota-card {
  padding: 18px 20px;
  margin-bottom: 18px;
}
.quota-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.quota-head-l {
  display: flex;
  align-items: center;
  gap: 12px;
}
.quota-ic {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}
.quota-title {
  font-size: 14px;
  font-weight: 650;
}
.quota-prov {
  font-size: 12px;
  color: var(--text-3);
}
.quota-nums {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}
.qn {
  text-align: center;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--bg-1);
  border: 1px solid var(--border);
}
.qn-num {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.qn-num.remain {
  color: var(--accent);
}
.qn-label {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.quota-bar {
  height: 9px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.quota-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  transition: width 0.4s ease;
}
.quota-pct {
  margin-top: 6px;
  font-size: 11.5px;
  color: var(--text-3);
  text-align: right;
}
.quota-msg {
  font-size: 12.5px;
  color: var(--text-3);
  padding: 6px 0;
}

.section-h {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-2);
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.kpi {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}
.kpi-ic {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
}
.kpi-num {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.kpi-label {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.sum-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.sum-item {
  flex: 1;
  min-width: 70px;
  text-align: center;
}
.sum-num {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.sum-num.ok {
  color: var(--success);
}
.sum-num.bad {
  color: var(--danger);
}
.sum-label {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 2px;
}
.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.block {
  padding: 18px 20px;
}
.block-title {
  margin: 0 0 16px;
  font-size: 13.5px;
  font-weight: 650;
}
.block-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.block-title-row .block-title {
  margin: 0;
}
.bars {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  height: 130px;
}
.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  height: 100%;
}
.bar-wrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: 62%;
  min-height: 3px;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, var(--accent), var(--accent-soft));
  position: relative;
  transition: height 0.3s ease;
}
.bar-n {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.bar-label {
  font-size: 10.5px;
  color: var(--text-3);
}
.models {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.model-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.model-name {
  flex: 0 1 180px;
  min-width: 80px;
  font-size: 12.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-bar-wrap {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}
.model-bar {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.3s ease;
}
.model-n {
  width: 36px;
  text-align: right;
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.empty-line {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-3);
}
</style>
