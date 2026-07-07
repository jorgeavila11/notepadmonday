import React, { useState, useEffect, useRef, useCallback } from 'react'

/**
 * ============================================================================
 *  Notepad — Notes / editable table widget for monday.com
 * ============================================================================
 *
 *  Layout inspirado no widget de "Texto" do monday:
 *   - Cabeçalho no topo (pega-para-arrastar + título editável)
 *   - Área de escrita grande no meio
 *   - Barra de ferramentas embaixo
 *
 *  Recursos:
 *   - Digitar texto (a área cresce sozinha)
 *   - Adicionar / remover linhas e colunas (menu "Table" e botão direito)
 *   - Redimensionar a largura das colunas (quando há mais de uma)
 *   - Tamanho, cor e tipo da fonte + negrito / itálico / sublinhado
 *   - Alinhamento do texto
 *   - Segue o tema do monday (light / dark / black / system default)
 *   - Salva na memória interna do monday (monday.storage.instance)
 *
 *  Uso no App:  <Notepad mondayInstance={mondaySdk()} />
 */

const STORAGE_KEY = 'notes_table_v1'

const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Roboto',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Poppins',
]
const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32]

// Cor "padrão" = null -> segue a cor de texto do tema. Só cores escolhidas
// no seletor ficam fixas. (o valor legado '#2b2f3a' também é tratado como auto)
const LEGACY_DEFAULT_COLOR = '#2b2f3a'
const isAutoColor = (color) => !color || color === LEGACY_DEFAULT_COLOR

const defaultCellStyle = () => ({
  fontFamily: 'Arial',
  fontSize: 15,
  color: null,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
})

const makeCell = (text = '', style = null) => ({
  text,
  style: style || defaultCellStyle(),
})

// Começa limpo: título "Text", uma coluna e uma linha vazia
const buildInitialState = () => ({
  title: 'Text',
  cols: [{ id: 'c0', width: 480 }],
  rows: [{ id: 'r0' }],
  cells: [[makeCell('')]],
})

// -------------------------------- Temas ----------------------------------
const THEMES = {
  light: {
    appBg: '#ffffff',
    surface: '#ffffff',
    outerBorder: '#d7dbe6',
    headerBorder: '#eef0f4',
    sep: '#eceef3',
    text: '#2b2f3a',
    title: '#323338',
    subtext: '#8a90a2',
    iconColor: '#4b5162',
    gridLine: '#dfe3ec',
    hover: '#f1f2f6',
    selected: '#f4f8ff',
    highlight: '#e6f0ff',
    inputBg: '#ffffff',
    inputBorder: '#e0e3ea',
    menuBg: '#ffffff',
    menuBorder: '#e6e9ef',
    menuHover: '#f4f6fb',
    placeholder: '#c3c7d2',
    primary: '#0073ea',
    shadow: 'rgba(29,42,68,0.06)',
    menuShadow: 'rgba(29,42,68,0.16)',
  },
  dark: {
    appBg: '#30324e',
    surface: '#3b3d5c',
    outerBorder: '#43456b',
    headerBorder: '#43456b',
    sep: '#4a4d70',
    text: '#d5d8df',
    title: '#ffffff',
    subtext: '#9699b3',
    iconColor: '#c3c6da',
    gridLine: '#4a4d70',
    hover: 'rgba(255,255,255,0.08)',
    selected: 'rgba(0,115,234,0.20)',
    highlight: 'rgba(0,115,234,0.30)',
    inputBg: '#3b3d5c',
    inputBorder: '#4a4d70',
    menuBg: '#3b3d5c',
    menuBorder: '#4a4d70',
    menuHover: 'rgba(255,255,255,0.06)',
    placeholder: '#7e81a0',
    primary: '#0073ea',
    shadow: 'rgba(0,0,0,0.4)',
    menuShadow: 'rgba(0,0,0,0.5)',
  },
  black: {
    appBg: '#222222',
    surface: '#2e2e2e',
    outerBorder: '#3a3a3a',
    headerBorder: '#3a3a3a',
    sep: '#3d3d3d',
    text: '#e6e6e6',
    title: '#ffffff',
    subtext: '#9a9a9a',
    iconColor: '#cccccc',
    gridLine: '#3d3d3d',
    hover: 'rgba(255,255,255,0.08)',
    selected: 'rgba(0,115,234,0.22)',
    highlight: 'rgba(0,115,234,0.32)',
    inputBg: '#2e2e2e',
    inputBorder: '#3d3d3d',
    menuBg: '#2e2e2e',
    menuBorder: '#3d3d3d',
    menuHover: 'rgba(255,255,255,0.07)',
    placeholder: '#7a7a7a',
    primary: '#0073ea',
    shadow: 'rgba(0,0,0,0.5)',
    menuShadow: 'rgba(0,0,0,0.6)',
  },
}

// Fallback quando roda FORA do monday (sem SDK)
let localMemoryStore = null

const resolveMonday = (propInstance) => {
  if (propInstance) return propInstance
  if (typeof window !== 'undefined' && typeof window.mondaySdk === 'function') {
    try {
      return window.mondaySdk()
    } catch (e) {
      return null
    }
  }
  return null
}

// Ajusta a altura do textarea ao conteúdo (efeito "bloco de notas")
const sizeTa = (el) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

// Ícone do pega-para-arrastar (6 pontinhos, como no monday)
const DragDots = ({ color }) => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill={color} aria-hidden="true">
    <circle cx="2" cy="3" r="1.4" />
    <circle cx="8" cy="3" r="1.4" />
    <circle cx="2" cy="8" r="1.4" />
    <circle cx="8" cy="8" r="1.4" />
    <circle cx="2" cy="13" r="1.4" />
    <circle cx="8" cy="13" r="1.4" />
  </svg>
)

const Notepad = ({ mondayInstance = null }) => {
  const monday = resolveMonday(mondayInstance)
  const hasMonday = !!(monday && monday.storage && monday.storage.instance)

  const [state, setState] = useState(() => buildInitialState())
  const [selected, setSelected] = useState({ r: 0, c: 0 })
  const [saveStatus, setSaveStatus] = useState(hasMonday ? 'idle' : 'local')
  const [loaded, setLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctx, setCtx] = useState(null) // menu de contexto: { x, y, r, c }
  const [ctxDim, setCtxDim] = useState('row') // 'row' | 'col' — o que destacar
  const [theme, setTheme] = useState('light')

  const saveTimer = useRef(null)
  const gridRef = useRef(null)
  const menuRef = useRef(null)
  const ctxRef = useRef(null)
  const uidRef = useRef(1000)
  const nextId = () => 'id' + uidRef.current++

  const t = THEMES[theme] || THEMES.light
  const multiCol = state.cols.length > 1

  // ------------------------- Tema do monday --------------------------------
  useEffect(() => {
    if (!monday || typeof monday.get !== 'function') return
    let cancelled = false
    const apply = (th) => {
      if (cancelled || !th) return
      setTheme(THEMES[th] ? th : 'light')
    }
    monday
      .get('context')
      .then((res) => apply(res && res.data && res.data.theme))
      .catch(() => {})
    let unsub
    if (typeof monday.listen === 'function') {
      unsub = monday.listen('context', (res) => apply(res && res.data && res.data.theme))
    }
    return () => {
      cancelled = true
      if (typeof unsub === 'function') unsub()
    }
  }, [monday])

  // ------------------------- Carregar dados salvos -------------------------
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (hasMonday) {
        try {
          const res = await monday.storage.instance.getItem(STORAGE_KEY)
          const value = res && res.data && res.data.value
          if (!cancelled && value) {
            const parsed = JSON.parse(value)
            if (parsed && parsed.cells) setState({ title: 'Text', ...parsed })
          }
        } catch (e) {
          console.error('[Notepad] Read error:', e)
          if (!cancelled) setSaveStatus('error')
        }
      } else if (localMemoryStore) {
        if (!cancelled) setState(localMemoryStore)
      }
      if (!cancelled) setLoaded(true)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMonday])

  // ------------------------------- Salvar ---------------------------------
  const persist = useCallback(
    async (data) => {
      const payload = JSON.stringify(data)
      if (hasMonday) {
        try {
          setSaveStatus('saving')
          const res = await monday.storage.instance.setItem(STORAGE_KEY, payload)
          const ok = res && res.data && res.data.success
          if (ok) {
            setSaveStatus('saved')
            setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1500)
          } else {
            setSaveStatus('error')
          }
        } catch (e) {
          console.error('[Notepad] Save error:', e)
          setSaveStatus('error')
        }
      } else {
        localMemoryStore = data
        setSaveStatus('local')
      }
    },
    [hasMonday, monday]
  )

  // Auto-save com debounce
  useEffect(() => {
    if (!loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(state), 700)
    return () => saveTimer.current && clearTimeout(saveTimer.current)
  }, [state, loaded, persist])

  // Redimensiona os textareas quando a estrutura muda ou ao carregar dados
  useEffect(() => {
    if (!gridRef.current) return
    gridRef.current.querySelectorAll('textarea').forEach(sizeTa)
  }, [state.cols.length, state.rows.length, loaded])

  // Fecha o menu "Table" ao clicar fora
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  // Fecha o menu de contexto (clique fora / ESC)
  useEffect(() => {
    if (!ctx) return
    const onDown = (e) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target)) setCtx(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setCtx(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  // --------------------------- Edição de células ---------------------------
  const setTitle = (title) => setState((prev) => ({ ...prev, title }))

  const updateCellText = (r, c, text) => {
    setState((prev) => {
      const cells = prev.cells.map((row) => row.slice())
      cells[r][c] = { ...cells[r][c], text }
      return { ...prev, cells }
    })
  }

  const applyStyleToSelected = (patch) => {
    setState((prev) => {
      const { r, c } = selected
      if (r == null || c == null || !prev.cells[r] || !prev.cells[r][c]) return prev
      const cells = prev.cells.map((row) => row.slice())
      cells[r][c] = { ...cells[r][c], style: { ...cells[r][c].style, ...patch } }
      return { ...prev, cells }
    })
  }

  const toggleSelectedFlag = (flag) => {
    const cur = state.cells?.[selected.r]?.[selected.c]?.style
    if (!cur) return
    applyStyleToSelected({ [flag]: !cur[flag] })
  }

  const selStyle = state.cells?.[selected.r]?.[selected.c]?.style || defaultCellStyle()
  const selColor = isAutoColor(selStyle.color) ? t.text : selStyle.color

  // ------------------------- Linhas e colunas ------------------------------
  const addRow = () =>
    setState((prev) => ({
      ...prev,
      rows: [...prev.rows, { id: nextId() }],
      cells: [...prev.cells, prev.cols.map(() => makeCell())],
    }))

  const addColumn = () =>
    setState((prev) => ({
      ...prev,
      cols: [...prev.cols, { id: nextId(), width: 200 }],
      cells: prev.cells.map((row) => [...row, makeCell()]),
    }))

  const removeRowAt = (index) => {
    setState((prev) => {
      if (prev.rows.length <= 1) return prev
      return {
        ...prev,
        rows: prev.rows.filter((_, i) => i !== index),
        cells: prev.cells.filter((_, i) => i !== index),
      }
    })
    setSelected((s) => ({ r: Math.max(0, Math.min(s.r, state.rows.length - 2)), c: s.c }))
  }

  const removeColumnAt = (index) => {
    setState((prev) => {
      if (prev.cols.length <= 1) return prev
      return {
        ...prev,
        cols: prev.cols.filter((_, i) => i !== index),
        cells: prev.cells.map((row) => row.filter((_, i) => i !== index)),
      }
    })
    setSelected((s) => ({ r: s.r, c: Math.max(0, Math.min(s.c, state.cols.length - 2)) }))
  }

  const insertRowAt = (index) =>
    setState((prev) => {
      const rows = prev.rows.slice()
      rows.splice(index + 1, 0, { id: nextId() })
      const cells = prev.cells.slice()
      cells.splice(index + 1, 0, prev.cols.map(() => makeCell()))
      return { ...prev, rows, cells }
    })

  const insertColumnAt = (index) =>
    setState((prev) => {
      const cols = prev.cols.slice()
      cols.splice(index + 1, 0, { id: nextId(), width: 200 })
      const cells = prev.cells.map((row) => {
        const r = row.slice()
        r.splice(index + 1, 0, makeCell())
        return r
      })
      return { ...prev, cols, cells }
    })

  const removeSelectedRow = () => removeRowAt(selected.r)
  const removeSelectedColumn = () => removeColumnAt(selected.c)

  // ------------------------ Redimensionar coluna ---------------------------
  const startColResize = (index, e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = state.cols[index].width
    const onMove = (ev) => {
      const w = Math.max(80, startW + (ev.clientX - startX))
      setState((prev) => {
        const cols = prev.cols.slice()
        cols[index] = { ...cols[index], width: w }
        return { ...prev, cols }
      })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Clicar na área vazia foca a última célula
  const focusEmptyArea = (e) => {
    if (e.target !== gridRef.current) return
    const tas = gridRef.current.querySelectorAll('textarea')
    const last = tas[tas.length - 1]
    if (last) last.focus()
  }

  // Abre o menu de contexto (botão direito) na célula clicada
  const openContextMenu = (ri, ci, e) => {
    e.preventDefault()
    setSelected({ r: ri, c: ci })
    setCtxDim('row')
    setCtx({ x: e.clientX, y: e.clientY, r: ri, c: ci })
  }

  // ------------------------------- Estilos ---------------------------------
  const ui = {
    wrap: {
      fontFamily: 'Roboto, Arial, sans-serif',
      color: t.text,
      background: t.appBg,
      border: '1px solid ' + t.outerBorder,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 6px 22px ' + t.shadow,
      maxWidth: '100%',
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '10px 14px',
      borderBottom: '1px solid ' + t.headerBorder,
    },
    dragHandle: { display: 'inline-flex', alignItems: 'center', cursor: 'grab', padding: 2 },
    titleInput: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontSize: 17,
      fontWeight: 600,
      color: t.title,
      padding: 0,
    },
    page: {
      overflow: 'auto',
      minHeight: 220,
      maxHeight: 520,
      background: t.appBg,
      padding: '12px 8px',
      cursor: 'text',
    },
    cell: (isSel, hl) => ({
      position: 'relative',
      borderBottom: '1px solid ' + t.gridLine,
      borderRight: multiCol ? '1px solid ' + t.gridLine : 'none',
      background: hl ? t.highlight : isSel ? t.selected : 'transparent',
      verticalAlign: 'top',
      transition: 'background .12s',
    }),
    textarea: (st) => ({
      display: 'block',
      width: '100%',
      minHeight: 30,
      border: 'none',
      outline: 'none',
      resize: 'none',
      background: 'transparent',
      padding: '7px 16px',
      boxSizing: 'border-box',
      fontFamily: st.fontFamily,
      fontSize: st.fontSize + 'px',
      color: isAutoColor(st.color) ? t.text : st.color,
      fontWeight: st.bold ? 700 : 400,
      fontStyle: st.italic ? 'italic' : 'normal',
      textDecoration: st.underline ? 'underline' : 'none',
      textAlign: st.align,
      lineHeight: 1.6,
      overflow: 'hidden',
    }),
    addRowBtn: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      width: '100%',
      margin: '2px 0',
      padding: '8px 16px',
      border: 'none',
      background: 'transparent',
      color: t.subtext,
      cursor: 'pointer',
      fontSize: 13,
      textAlign: 'left',
    },
    toolbar: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 3,
      padding: '8px 12px',
      background: t.appBg,
      borderTop: '1px solid ' + t.headerBorder,
    },
    sep: { width: 1, height: 22, background: t.sep, margin: '0 5px' },
    iconBtn: (active) => ({
      minWidth: 32,
      height: 32,
      padding: '0 7px',
      border: 'none',
      background: active ? t.selected : 'transparent',
      color: active ? t.primary : t.iconColor,
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 15,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
    select: {
      height: 30,
      border: '1px solid ' + t.inputBorder,
      borderRadius: 6,
      background: t.inputBg,
      padding: '0 6px',
      fontSize: 13,
      color: t.text,
      cursor: 'pointer',
      outline: 'none',
    },
    colorBtn: {
      width: 32,
      height: 32,
      borderRadius: 6,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtn: {
      height: 30,
      padding: '0 12px',
      border: '1px solid ' + t.primary,
      background: t.primary,
      color: '#fff',
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 12.5,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
    },
    menuWrap: { position: 'relative', display: 'inline-flex' },
    menuTrigger: {
      height: 32,
      padding: '0 9px',
      border: 'none',
      background: 'transparent',
      color: t.iconColor,
      borderRadius: 6,
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
    },
    menu: {
      position: 'absolute',
      bottom: 'calc(100% + 6px)',
      left: 0,
      minWidth: 190,
      background: t.menuBg,
      border: '1px solid ' + t.menuBorder,
      borderRadius: 10,
      boxShadow: '0 10px 28px ' + t.menuShadow,
      padding: 6,
      zIndex: 30,
    },
    menuItem: (disabled, danger) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      width: '100%',
      padding: '8px 10px',
      border: 'none',
      background: 'transparent',
      color: disabled ? t.subtext : danger ? '#e2445c' : t.text,
      borderRadius: 7,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 13,
      textAlign: 'left',
      opacity: disabled ? 0.6 : 1,
    }),
    menuIcon: { width: 16, textAlign: 'center', fontWeight: 700, fontSize: 15 },
    menuDivider: { height: 1, background: t.headerBorder, margin: '5px 4px' },
    ctxMenu: (x, y) => ({
      position: 'fixed',
      top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200),
      left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 214),
      minWidth: 204,
      background: t.menuBg,
      border: '1px solid ' + t.menuBorder,
      borderRadius: 10,
      boxShadow: '0 12px 30px ' + t.menuShadow,
      padding: 6,
      zIndex: 1000,
    }),
    status: { marginLeft: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 },
    dot: (color) => ({ width: 8, height: 8, borderRadius: '50%', background: color }),
  }

  const statusView = () => {
    if (saveStatus === 'idle') return null
    const map = {
      saving: ['#f5a623', 'Saving…'],
      saved: ['#00c875', 'Saved'],
      error: ['#e2445c', 'Save error'],
      local: ['#a25ddc', 'Local mode — not saved'],
    }
    const entry = map[saveStatus]
    if (!entry) return null
    const [c, label] = entry
    return (
      <span style={ui.status}>
        <span style={ui.dot(c)} />
        <span style={{ color: t.subtext }}>{label}</span>
      </span>
    )
  }

  return (
    <div style={ui.wrap}>
      <style>{`
        .npd-resizer{position:absolute;top:0;right:-3px;width:6px;height:100%;cursor:col-resize;z-index:5}
        .npd-resizer:hover{background:rgba(0,115,234,.3)}
        .npd-add:hover{color:${t.primary}}
        .npd-ph::placeholder{color:${t.placeholder}}
        .npd-ib:not([disabled]):hover{background:${t.hover}}
        .npd-mi:not([disabled]):hover{background:${t.menuHover}}
        .npd-title::placeholder{color:${t.placeholder}}
      `}</style>

      {/* ----------------------- Header ----------------------- */}
      <div style={ui.header}>
        <span style={ui.dragHandle} title="Drag to move">
          <DragDots color={t.placeholder} />
        </span>
        <input
          className="npd-title"
          style={ui.titleInput}
          value={state.title ?? ''}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
        />
      </div>

      {/* ------------------------- Writing area ------------------------- */}
      <div style={ui.page} ref={gridRef} onMouseDown={focusEmptyArea}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: multiCol ? 'max-content' : '100%' }}>
          <colgroup>
            {state.cols.map((col) => (
              <col key={col.id} style={{ width: multiCol ? col.width : '100%' }} />
            ))}
          </colgroup>
          <tbody>
            {state.cells.map((row, ri) => (
              <tr key={state.rows[ri]?.id || ri}>
                {row.map((cell, ci) => {
                  const isSel = selected.r === ri && selected.c === ci
                  const hl =
                    ctx != null &&
                    ((ctxDim === 'row' && ri === ctx.r) || (ctxDim === 'col' && ci === ctx.c))
                  return (
                    <td
                      key={ci}
                      style={ui.cell(isSel, hl)}
                      onContextMenu={(e) => openContextMenu(ri, ci, e)}
                    >
                      <textarea
                        className="npd-ph"
                        value={cell.text}
                        style={ui.textarea(cell.style)}
                        ref={sizeTa}
                        rows={1}
                        placeholder={ri === 0 && ci === 0 ? 'Type your text…' : ''}
                        onFocus={() => setSelected({ r: ri, c: ci })}
                        onChange={(e) => {
                          updateCellText(ri, ci, e.target.value)
                          sizeTa(e.target)
                        }}
                        spellCheck={true}
                      />
                      {multiCol && (
                        <div className="npd-resizer" onMouseDown={(e) => startColResize(ci, e)} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <button className="npd-add" style={ui.addRowBtn} onClick={addRow} title="Add row">
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> New row
        </button>
      </div>

      {/* --------------------- Toolbar (footer) --------------------- */}
      <div style={ui.toolbar}>
        <button className="npd-ib" style={ui.iconBtn(selStyle.bold)} onClick={() => toggleSelectedFlag('bold')} title="Bold">
          <span style={{ fontWeight: 800 }}>B</span>
        </button>
        <button className="npd-ib" style={ui.iconBtn(selStyle.italic)} onClick={() => toggleSelectedFlag('italic')} title="Italic">
          <span style={{ fontStyle: 'italic', fontFamily: 'Georgia,serif' }}>I</span>
        </button>
        <button
          className="npd-ib"
          style={ui.iconBtn(selStyle.underline)}
          onClick={() => toggleSelectedFlag('underline')}
          title="Underline"
        >
          <span style={{ textDecoration: 'underline' }}>U</span>
        </button>

        {/* Text color */}
        <label className="npd-ib" style={ui.colorBtn} title="Text color">
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: selColor,
              border: '2px solid ' + t.surface,
              boxShadow: '0 0 0 1px ' + t.inputBorder,
            }}
          />
          <input
            type="color"
            value={selColor}
            onChange={(e) => applyStyleToSelected({ color: e.target.value })}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          />
        </label>

        <span style={ui.sep} />

        {/* Font family and size */}
        <select
          style={{ ...ui.select, width: 118 }}
          value={selStyle.fontFamily}
          onChange={(e) => applyStyleToSelected({ fontFamily: e.target.value })}
          title="Font"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <select
          style={{ ...ui.select, width: 56 }}
          value={selStyle.fontSize}
          onChange={(e) => applyStyleToSelected({ fontSize: Number(e.target.value) })}
          title="Font size"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <span style={ui.sep} />

        {/* Alignment */}
        {[
          ['left', '⟸'],
          ['center', '≡'],
          ['right', '⟹'],
        ].map(([val, glyph]) => (
          <button
            key={val}
            className="npd-ib"
            style={ui.iconBtn(selStyle.align === val)}
            onClick={() => applyStyleToSelected({ align: val })}
            title={'Align ' + val}
          >
            {glyph}
          </button>
        ))}

        <span style={ui.sep} />

        {/* Table menu */}
        <div style={ui.menuWrap} ref={menuRef}>
          <button className="npd-ib" style={ui.menuTrigger} onClick={() => setMenuOpen((o) => !o)} title="Rows and columns">
            Table <span style={{ fontSize: 10, color: t.subtext }}>▾</span>
          </button>
          {menuOpen && (
            <div style={ui.menu}>
              <button
                className="npd-mi"
                style={ui.menuItem(false, false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  addRow()
                  setMenuOpen(false)
                }}
              >
                <span style={ui.menuIcon}>+</span> Add row
              </button>
              <button
                className="npd-mi"
                style={ui.menuItem(false, false)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  addColumn()
                  setMenuOpen(false)
                }}
              >
                <span style={ui.menuIcon}>+</span> Add column
              </button>
              <div style={ui.menuDivider} />
              <button
                className="npd-mi"
                style={ui.menuItem(state.rows.length <= 1, true)}
                disabled={state.rows.length <= 1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  removeSelectedRow()
                  setMenuOpen(false)
                }}
              >
                <span style={ui.menuIcon}>−</span> Delete row
              </button>
              <button
                className="npd-mi"
                style={ui.menuItem(!multiCol, true)}
                disabled={!multiCol}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  removeSelectedColumn()
                  setMenuOpen(false)
                }}
              >
                <span style={ui.menuIcon}>−</span> Delete column
              </button>
            </div>
          )}
        </div>

        <button style={ui.saveBtn} onClick={() => persist(state)} title="Save now">
          💾 Save
        </button>

        {statusView()}
      </div>

      {/* --------------------- Context menu (right click) --------------------- */}
      {ctx && (
        <div ref={ctxRef} style={ui.ctxMenu(ctx.x, ctx.y)}>
          <button
            className="npd-mi"
            style={ui.menuItem(false, false)}
            onMouseEnter={() => setCtxDim('row')}
            onClick={() => {
              insertRowAt(ctx.r)
              setCtx(null)
            }}
          >
            <span style={ui.menuIcon}>+</span> Insert row below
          </button>
          <button
            className="npd-mi"
            style={ui.menuItem(false, false)}
            onMouseEnter={() => setCtxDim('col')}
            onClick={() => {
              insertColumnAt(ctx.c)
              setCtx(null)
            }}
          >
            <span style={ui.menuIcon}>+</span> Insert column to the right
          </button>
          <div style={ui.menuDivider} />
          <button
            className="npd-mi"
            style={ui.menuItem(state.rows.length <= 1, true)}
            disabled={state.rows.length <= 1}
            onMouseEnter={() => setCtxDim('row')}
            onClick={() => {
              removeRowAt(ctx.r)
              setCtx(null)
            }}
          >
            <span style={ui.menuIcon}>−</span> Delete row
          </button>
          <button
            className="npd-mi"
            style={ui.menuItem(state.cols.length <= 1, true)}
            disabled={state.cols.length <= 1}
            onMouseEnter={() => setCtxDim('col')}
            onClick={() => {
              removeColumnAt(ctx.c)
              setCtx(null)
            }}
          >
            <span style={ui.menuIcon}>−</span> Delete column
          </button>
        </div>
      )}
    </div>
  )
}

export default Notepad