import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/todos'

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT']
const ASSIGNEES = ['준성', '민지', '현우', '수연', '태호']

function getTodayKey() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
}

function loadMonthlyPlan(year, month) {
  const key = `monthly-plan-${year}-${month}`
  try { return JSON.parse(localStorage.getItem(key)) || { plan: '', do: '', see: '' } }
  catch { return { plan: '', do: '', see: '' } }
}

function saveMonthlyPlan(year, month, data) {
  const key = `monthly-plan-${year}-${month}`
  localStorage.setItem(key, JSON.stringify(data))
}

export default function App() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [todoMap, setTodoMap] = useState({})
  const [selectedDate, setSelectedDate] = useState(null)
  const [modalTodos, setModalTodos] = useState([])
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [pickerOpenId, setPickerOpenId] = useState(null)
  const [monthlyPlan, setMonthlyPlan] = useState(() => loadMonthlyPlan(today.getFullYear(), today.getMonth()))
  const editRef = useRef(null)
  const newInputRef = useRef(null)
  const todayKey = getTodayKey()

  const loadAllTodos = useCallback(async () => {
    try {
      const res = await fetch(API)
      const data = await res.json()
      const map = {}
      data.forEach(t => {
        if (!map[t.dateKey]) map[t.dateKey] = []
        map[t.dateKey].push(t)
      })
      setTodoMap(map)
    } catch (e) {
      console.error('전체 로딩 실패:', e)
    }
  }, [])

  const loadDateTodos = useCallback(async (dateKey) => {
    try {
      const res = await fetch(`${API}?dateKey=${dateKey}`)
      const data = await res.json()
      setModalTodos(data)
    } catch (e) {
      console.error('날짜별 로딩 실패:', e)
    }
  }, [])

  useEffect(() => {
    loadAllTodos()
  }, [loadAllTodos])

  useEffect(() => {
    setMonthlyPlan(loadMonthlyPlan(year, month))
  }, [year, month])

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  function openModal(day) {
    const key = getDateKey(year, month, day)
    setSelectedDate({ year, month, day, key })
    loadDateTodos(key)
    setNewText('')
    setEditingId(null)
    setPickerOpenId(null)
  }

  function closeModal() {
    setSelectedDate(null)
    setModalTodos([])
    setEditingId(null)
    setPickerOpenId(null)
    loadAllTodos()
  }

  async function addTodo() {
    const text = newText.trim()
    if (!text || !selectedDate) return
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dateKey: selectedDate.key, _insertOrder: modalTodos.length, assignee: '' }),
      })
      setNewText('')
      loadDateTodos(selectedDate.key)
      newInputRef.current?.focus()
    } catch (e) {
      console.error('추가 실패:', e)
    }
  }

  async function deleteTodo(id) {
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' })
      loadDateTodos(selectedDate.key)
    } catch (e) {
      console.error('삭제 실패:', e)
    }
  }

  async function finishEdit(id) {
    const text = editText.trim()
    if (text) {
      try {
        await fetch(`${API}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
      } catch (e) {
        console.error('수정 실패:', e)
      }
    }
    setEditingId(null)
    loadDateTodos(selectedDate.key)
  }

  async function setAssignee(id, assignee) {
    try {
      await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee }),
      })
      setPickerOpenId(null)
      loadDateTodos(selectedDate.key)
    } catch (e) {
      console.error('담당자 설정 실패:', e)
    }
  }

  function handlePlanChange(field, value) {
    const updated = { ...monthlyPlan, [field]: value }
    setMonthlyPlan(updated)
    saveMonthlyPlan(year, month, updated)
  }

  const calendarDays = buildCalendarDays(year, month)

  const monthNum = String(month + 1).padStart(2, '0')

  function formatModalDate(d) {
    if (!d) return ''
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const dow = new Date(d.year, d.month, d.day).getDay()
    return `${d.year}. ${String(d.month + 1).padStart(2,'0')}. ${String(d.day).padStart(2,'0')} ${dayNames[dow]}`
  }

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <span className="header-title">JUN TO DO LIST</span>
        <span className="header-year">{year}</span>
      </header>

      {/* 월 탭 */}
      <nav className="month-tabs">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            className={`month-tab${month === i ? ' active' : ''}`}
            onClick={() => setMonth(i)}
          >
            {m}
          </button>
        ))}
      </nav>

      <div className="main-layout">
        {/* 사이드바 */}
        <aside className="sidebar">
          <div className="sidebar-month-num">{monthNum}</div>
          <div className="sidebar-month-name">{MONTH_NAMES[month]}</div>
          <div className="sidebar-year">{year}</div>
          <hr className="sidebar-divider" />
          <div className="sidebar-label">MONTHLY DOMINANT</div>
          <div className="sidebar-plan-block">
            <label className="plan-label">PLAN</label>
            <textarea
              className="plan-textarea"
              value={monthlyPlan.plan}
              onChange={(e) => handlePlanChange('plan', e.target.value)}
              placeholder="이번 달 계획..."
            />
          </div>
          <div className="sidebar-plan-block">
            <label className="plan-label">DO</label>
            <textarea
              className="plan-textarea"
              value={monthlyPlan.do}
              onChange={(e) => handlePlanChange('do', e.target.value)}
              placeholder="실행 항목..."
            />
          </div>
          <div className="sidebar-plan-block">
            <label className="plan-label">SEE</label>
            <textarea
              className="plan-textarea"
              value={monthlyPlan.see}
              onChange={(e) => handlePlanChange('see', e.target.value)}
              placeholder="회고..."
            />
          </div>
        </aside>

        {/* 캘린더 */}
        <main className="calendar-area">
          <div className="calendar-grid">
            {DAYS.map(d => (
              <div key={d} className="cal-header-cell">{d}</div>
            ))}
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} className="cal-cell empty" />
              const key = getDateKey(year, month, day)
              const isToday = key === todayKey
              const hasTodos = (todoMap[key] || []).length > 0
              return (
                <div
                  key={key}
                  className={`cal-cell${isToday ? ' today' : ''}`}
                  onClick={() => openModal(day)}
                >
                  <span className="cal-day-num">{day}</span>
                  {hasTodos && <span className="todo-dot" />}
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {/* 모달 */}
      {selectedDate && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-date">{formatModalDate(selectedDate)}</span>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            <ul className="modal-todo-list">
              {modalTodos.length === 0 && (
                <li className="modal-empty">할일이 없습니다</li>
              )}
              {modalTodos.map(todo => (
                <li key={todo._id} className="modal-todo-item">
                  {editingId === todo._id ? (
                    <input
                      ref={editRef}
                      className="modal-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishEdit(todo._id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => finishEdit(todo._id)}
                    />
                  ) : (
                    <span
                      className="modal-todo-text"
                      onClick={() => { setEditingId(todo._id); setEditText(todo.text) }}
                      title="클릭하여 수정"
                    >
                      {todo.text}
                    </span>
                  )}
                  {todo.assignee && (
                    <span className="modal-assignee-badge">{todo.assignee}</span>
                  )}
                  <div className="modal-todo-actions">
                    <button
                      className="assignee-btn"
                      title="담당자 지정"
                      onClick={() => setPickerOpenId(pickerOpenId === todo._id ? null : todo._id)}
                    >›</button>
                    <button className="modal-delete-btn" onClick={() => deleteTodo(todo._id)}>×</button>
                  </div>
                  {pickerOpenId === todo._id && (
                    <div className="assignee-picker">
                      {ASSIGNEES.map(name => (
                        <button
                          key={name}
                          className={`assignee-option${todo.assignee === name ? ' selected' : ''}`}
                          onClick={() => setAssignee(todo._id, name)}
                        >
                          {name}
                        </button>
                      ))}
                      <button
                        className="assignee-option none"
                        onClick={() => setAssignee(todo._id, '')}
                      >
                        없음
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <div className="modal-input-row">
              <input
                ref={newInputRef}
                className="modal-new-input"
                type="text"
                placeholder="할일 추가..."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                maxLength={100}
                autoComplete="off"
              />
              <button className="modal-add-btn" onClick={addTodo}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
