import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useDrillStore } from '../stores/drill'
import { useDrillNamingStore } from '../stores/naming'

describe('命名覆盖（管理员）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('实例改名后资源目录同步显示', () => {
    const drill = useDrillStore()
    const naming = useDrillNamingStore()

    const slot = drill.snapshot.shop.find((item) => item.unitId !== null && !item.soldOut)
    expect(slot).toBeTruthy()
    const defId = slot?.unitId ?? ''

    naming.renameUnit(defId, '改名实例')

    const updated = drill.snapshot.shop.find((item) => item.unitId === defId)
    expect(updated?.name).toBe('改名实例')
  })

  it('亲和组改名生效、清空后回到出厂名', () => {
    const drill = useDrillStore()
    const naming = useDrillNamingStore()

    naming.renameTrait('xiaoshida', '小狮达·改')
    expect(drill.snapshot.traits.find((trait) => trait.id === 'xiaoshida')?.label).toBe('小狮达·改')

    naming.resetTrait('xiaoshida')
    expect(drill.snapshot.traits.find((trait) => trait.id === 'xiaoshida')?.label).toBe('小狮达')
  })

  it('改名写入 localStorage，且重置后清空', async () => {
    const naming = useDrillNamingStore()

    naming.renameUnit('shunfengyao', '张三')
    await nextTick()
    expect(localStorage.getItem('fm.drill.naming.v1')).toContain('张三')

    naming.resetAll()
    await nextTick()
    expect(localStorage.getItem('fm.drill.naming.v1')).not.toContain('张三')
  })
})
