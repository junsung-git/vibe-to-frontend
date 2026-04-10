import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/todos'
const SETTINGS_API = API.replace('/todos', '/settings')

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT']
const DOW_KO = ['일','월','화','수','목','금','토']
const TODO_COLORS = [
  { color: '#4a4a4a' },
  { color: '#b85c5c' },
  { color: '#5c7eb8' },
  { color: '#5a9e6f' },
  { color: '#c49a3c' },
]

function parseOrder(text) {
  const m = text.match(/^(\d+) /)
  return m ? parseInt(m[1]) : Infinity
}
function displayText(text) {
  return text.replace(/^\d+ /, '')
}
function sortTodos(todos) {
  return [...todos].sort((a, b) => parseOrder(a.text) - parseOrder(b.text))
}
function dateKey(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

export default function App() {
  const today = useMemo(() => new Date(), [])

  // ── AUTH ──
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loginMode, setLoginMode] = useState('guest')
  const [loginPw, setLoginPw] = useState('')
  const [loginError, setLoginError] = useState('')
  const [pwChangeOpen, setPwChangeOpen] = useState(false)
  const [pwChangeGuest, setPwChangeGuest] = useState('')
  const [pwChangeAdmin, setPwChangeAdmin] = useState('')
  const [pwChangeMsg, setPwChangeMsg] = useState('')
  const [passwords, setPasswords] = useState({ guest: '0000', admin: '0000' })

  // ── CALENDAR ──
  const [curYear, setCurYear] = useState(today.getFullYear())
  const [curMonth, setCurMonth] = useState(today.getMonth())
  const [todosMap, setTodosMap] = useState({})
  const [members, setMembers] = useState([])
  const [memo, setMemo] = useState('')

  // ── DAY MODAL ──
  const [selectedDate, setSelectedDate] = useState(null)
  const [newInput, setNewInput] = useState('')
  const [selectedColor, setSelectedColor] = useState(TODO_COLORS[0].color)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editColor, setEditColor] = useState(TODO_COLORS[0].color)
  const [openPickerId, setOpenPickerId] = useState(null)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const [extraDays, setExtraDays] = useState(0)
  const [editExtraDays, setEditExtraDays] = useState(0)

  // ── VACATION ──
  // vacData: { [name]: { remaining, total, joinDate, days: { [dk]: { value, halfType } } } }
  const [vacMode, setVacMode] = useState(false)
  const [vacData, setVacData] = useState({})
  const [vacModalDate, setVacModalDate] = useState(null)
  const [vacDaysOpen, setVacDaysOpen] = useState(false)
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  const [joinDateEditName, setJoinDateEditName] = useState(null)
  const [joinDatePickerStep, setJoinDatePickerStep] = useState('month')
  const [joinDatePickerYear, setJoinDatePickerYear] = useState(null)
  const [joinDatePickerMonth, setJoinDatePickerMonth] = useState(null)

  // 연도별 법정 평일 공휴일 목록 (YYYY-MM-DD, 토일 제외)
  const HOLIDAYS_BY_YEAR = {
    2024: ['2024-01-01','2024-02-09','2024-02-10','2024-02-12',
           '2024-04-10','2024-05-06','2024-05-15','2024-06-06',
           '2024-08-15','2024-09-16','2024-09-17','2024-09-18',
           '2024-10-03','2024-10-09','2024-12-25'],
    2025: ['2025-01-01','2025-01-27','2025-01-28','2025-01-29','2025-01-30',
           '2025-03-03','2025-05-05','2025-05-06','2025-06-03','2025-06-06',
           '2025-08-15','2025-10-03','2025-10-06','2025-10-07','2025-10-08',
           '2025-10-09','2025-12-25'],
    2026: ['2026-01-01','2026-02-16','2026-02-17','2026-02-18',
           '2026-03-02','2026-05-05','2026-05-25','2026-06-03',
           '2026-07-17','2026-08-17','2026-09-24','2026-09-25','2026-09-28',
           '2026-10-05','2026-10-09','2026-12-25'],
  }

  function getWeekdayHolidaysFrom(year, fromDate) {
    const list = HOLIDAYS_BY_YEAR[year] || []
    return list.filter(d => new Date(d + 'T00:00:00') >= fromDate).length
  }

  function countWeekends(fromDate, toDate) {
    let count = 0
    const d = new Date(fromDate)
    d.setHours(0,0,0,0)
    const end = new Date(toDate)
    end.setHours(0,0,0,0)
    while (d <= end) {
      const dow = d.getDay()
      if (dow === 0 || dow === 6) count++
      d.setDate(d.getDate() + 1)
    }
    return count
  }

  // 입사일 기준 완성된 근속 개월 수 (날짜까지 정확하게)
  // 예: 10월20일 입사 → 11월20일이 지나야 1개월
  function completedMonths(fromDate, toDate) {
    let m = (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth())
    if (toDate.getDate() < fromDate.getDate()) m--
    return Math.max(0, m)
  }

  // 입사일 기준 총 휴일 계산 (주말 + 법정공휴일 + 연차/월차)
  function calcAnnualLeave(joinDateStr, targetYear) {
    if (!joinDateStr) return 0
    const join = new Date(joinDateStr + 'T00:00:00')
    const yearStart = new Date(targetYear, 0, 1)
    const yearEnd = new Date(targetYear, 11, 31)
    if (join > yearEnd) return 0

    const todayD = new Date()
    todayD.setHours(0,0,0,0)
    const endRef = todayD < yearEnd ? todayD : yearEnd

    // 날짜 정확한 근속 개월 계산
    const monthsAtJan1 = completedMonths(join, yearStart)
    const monthsAtEnd = completedMonths(join, endRef)

    let leaveCount
    if (monthsAtJan1 >= 12) {
      // 1년 이상 근속: 법정 연차
      const yearsAtJan1 = Math.floor(monthsAtJan1 / 12)
      leaveCount = Math.min(15 + Math.floor((yearsAtJan1 - 1) / 2), 25)
    } else if (monthsAtEnd >= 12) {
      // 올해 중 1주년 도래: 15일
      leaveCount = 15
    } else {
      // 1년 미만: 당해 연도 내 발생한 월차 (입사일 기준 날짜까지 정확하게)
      const prevYearEnd = new Date(targetYear, 0, 0)  // 전년도 12월31일
      const prevYearMonths = completedMonths(join, prevYearEnd)
      leaveCount = Math.max(0, monthsAtEnd - prevYearMonths)
    }

    // 주말: 연도 전체 (입사일 이후)
    const rangeFrom = join > yearStart ? join : yearStart
    const weekends = countWeekends(rangeFrom, yearEnd)

    // 공휴일: 연도 전체 (입사일 이후)
    const holidays = getWeekdayHolidaysFrom(targetYear, rangeFrom)

    return leaveCount + weekends + holidays
  }

  function vacSetJoinDate(name, joinDate) {
    setVacData(prev => {
      const entry = prev[name] || { total: 0, remaining: 0, days: {} }
      const used = Object.values(entry.days || {}).reduce((s, d) => s + (d.value || 0), 0)
      const newTotal = calcAnnualLeave(joinDate, curYear)
      return { ...prev, [name]: { ...entry, joinDate, total: newTotal, remaining: newTotal - used } }
    })
  }

  function getVacDay(name, dk) {
    return vacData[name]?.days?.[dk] || { value: 0 }
  }
  function getVacRemaining(name) {
    return vacData[name]?.remaining ?? 0
  }
  function addDaysToKey(dk, n) {
    const d = new Date(dk + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
  // +1: value가 1 미만인 첫 번째 칸을 찾아 1로 설정
  function vacAddFull(name, startDk) {
    setVacData(prev => {
      const entry = prev[name] || { remaining: 0, days: {} }
      let targetDk = startDk
      while ((entry.days[targetDk]?.value || 0) >= 1) {
        targetDk = addDaysToKey(targetDk, 1)
      }
      const cur = entry.days[targetDk]?.value || 0
      const cost = 1 - cur  // 이미 0.5면 0.5만 차감
      return {
        ...prev,
        [name]: {
          ...entry,
          remaining: entry.remaining - cost,
          days: { ...entry.days, [targetDk]: { value: 1 } }
        }
      }
    })
  }
  // halfType: 'am' = 이름/, 'pm' = /이름
  function vacAddHalf(name, startDk, halfType) {
    setVacData(prev => {
      const entry = prev[name] || { remaining: 0, days: {} }
      let targetDk = startDk
      while ((entry.days[targetDk]?.value || 0) >= 1) {
        targetDk = addDaysToKey(targetDk, 1)
      }
      const cur = entry.days[targetDk]?.value || 0
      const newVal = Math.min(cur + 0.5, 1)
      // 0.5+0.5=1이 되면 halfType 제거(종일), 아니면 halfType 저장
      const newHalfType = newVal === 1 ? null : halfType
      return {
        ...prev,
        [name]: {
          ...entry,
          remaining: entry.remaining - 0.5,
          days: { ...entry.days, [targetDk]: { value: newVal, halfType: newHalfType } }
        }
      }
    })
  }
  function vacClearDay(name, dk) {
    setVacData(prev => {
      const entry = prev[name] || { remaining: 0, days: {} }
      const refund = entry.days[dk]?.value || 0
      const newDays = { ...entry.days }
      delete newDays[dk]
      return { ...prev, [name]: { ...entry, remaining: entry.remaining + refund, days: newDays } }
    })
  }
  function vacSetRemaining(name, val) {
    setVacData(prev => ({
      ...prev,
      [name]: { ...(prev[name] || { total: 0, remaining: 0, days: {} }), remaining: val }
    }))
  }
  function vacSetTotal(name, val) {
    setVacData(prev => {
      const entry = prev[name] || { total: 0, remaining: 0, days: {} }
      const used = Object.values(entry.days || {}).reduce((sum, d) => sum + (d.value || 0), 0)
      return { ...prev, [name]: { ...entry, total: val, remaining: val - used } }
    })
  }
  function getVacTotal(name) {
    return vacData[name]?.total ?? 0
  }

  // ── OTHER MODALS ──
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [memberInput, setMemberInput] = useState('')
  const [editingMember, setEditingMember] = useState(null)
  const [editMemberText, setEditMemberText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const monthTabsRef = useRef(null)
  const newInputRef = useRef(null)
  const editInputRef = useRef(null)

  // ── API ──
  const loadSettings = useCallback(async () => {
    try {
      const [mRes, memRes, pwRes, vacRes] = await Promise.all([
        fetch(`${SETTINGS_API}/memo`),
        fetch(`${SETTINGS_API}/members`),
        fetch(`${SETTINGS_API}/passwords`),
        fetch(`${SETTINGS_API}/vacationData`),
      ])
      const mData = await mRes.json()
      const memData = await memRes.json()
      const pwData = await pwRes.json()
      const vacD = await vacRes.json()
      if (mData.value !== null) setMemo(mData.value)
      if (memData.value !== null) setMembers(memData.value)
      if (pwData.value !== null) setPasswords(pwData.value)
      if (vacD.value !== null) setVacData(vacD.value)
      vacDataLoaded.current = true  // DB 로드 완료 후에만 저장 허용
    } catch (e) {
      console.error('설정 로드 실패:', e)
      vacDataLoaded.current = true  // 로드 실패해도 이후 변경은 저장 허용
    }
  }, [])

  async function saveSetting(key, value) {
    try {
      await fetch(`${SETTINGS_API}/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
    } catch (e) { console.error('설정 저장 실패:', e) }
  }

  const loadAllTodos = useCallback(async () => {
    try {
      const res = await fetch(API)
      const data = await res.json()
      const map = {}
      data.forEach(t => {
        if (!map[t.dateKey]) map[t.dateKey] = []
        map[t.dateKey].push({
          id: t._id,
          text: t.text,
          done: t.done,
          assignee: t.assignee || '',
          color: t.color || TODO_COLORS[0].color,
        })
      })
      setTodosMap(map)
    } catch (e) {
      console.error('로드 실패:', e)
    }
  }, [])

  // 앱 시작 시 비번 미리 로드
  useEffect(() => {
    fetch(`${SETTINGS_API}/passwords`)
      .then(r => r.json())
      .then(d => { if (d.value !== null) setPasswords(d.value) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      loadAllTodos()
      loadSettings()
    }
  }, [isLoggedIn, loadAllTodos, loadSettings])

  // vacData 변경 시 DB 저장 (디바운스 500ms)
  // vacDataLoaded가 true일 때만 저장 (DB 로드 전에 빈값으로 덮어쓰기 방지)
  const vacDataLoaded = useRef(false)
  useEffect(() => {
    if (!vacDataLoaded.current) return
    const timer = setTimeout(() => {
      saveSetting('vacationData', vacData)
    }, 500)
    return () => clearTimeout(timer)
  }, [vacData])

  // 연도 팝업 외부 클릭 닫기
  useEffect(() => {
    if (!yearPickerOpen) return
    const handler = (e) => { if (!e.target.closest('.year-picker-wrap')) setYearPickerOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [yearPickerOpen])

  // Ctrl+F
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setSearchOpen(true) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Close picker on outside click
  useEffect(() => {
    if (!openPickerId) return
    const handler = (e) => {
      if (!e.target.closest('.assignee-picker') && !e.target.closest('.icon-btn')) {
        setOpenPickerId(null)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [openPickerId])

  // Scroll active tab into view
  useEffect(() => {
    if (monthTabsRef.current) {
      const active = monthTabsRef.current.querySelector('.active')
      if (active) active.scrollIntoView({ inline: 'center', behavior: 'smooth' })
    }
  }, [curMonth])

  // Focus new input when modal opens
  useEffect(() => {
    if (selectedDate) {
      setTimeout(() => newInputRef.current?.focus(), 300)
    }
  }, [selectedDate])

  // Focus edit input
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // ── AUTH HANDLERS ──
  function tryLogin() {
    const correct = loginMode === 'guest' ? passwords.guest : passwords.admin
    if (loginPw === correct) {
      setIsLoggedIn(true)
      setIsAdmin(loginMode === 'admin')
      setLoginPw('')
      setLoginError('')
    } else {
      setLoginError('비밀번호가 틀렸습니다')
      setLoginPw('')
    }
  }

  function savePwChange() {
    if (!pwChangeGuest && !pwChangeAdmin) {
      setPwChangeMsg('변경할 비밀번호를 입력하세요')
      return
    }
    const updated = { ...passwords }
    if (pwChangeGuest) updated.guest = pwChangeGuest
    if (pwChangeAdmin) updated.admin = pwChangeAdmin
    setPasswords(updated)
    saveSetting('passwords', updated)
    setPwChangeMsg('저장되었습니다')
    setTimeout(() => { setPwChangeOpen(false); setPwChangeMsg('') }, 800)
  }

  // ── TODO CRUD ──
  function addDaysToKey(dk, n) {
    const [y, m, d] = dk.split('-').map(Number)
    const date = new Date(y, m - 1, d + n)
    return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }

  async function addTodo() {
    const text = newInput.trim()
    if (!text || !selectedDate) return
    try {
      const requests = []
      for (let i = 0; i <= extraDays; i++) {
        const dk = addDaysToKey(selectedDate, i)
        requests.push(fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateKey: dk, text, assignee: '', color: selectedColor }),
        }))
      }
      await Promise.all(requests)
      setNewInput('')
      setExtraDays(0)
      await loadAllTodos()
    } catch (e) { console.error('추가 실패:', e) }
  }

  async function toggleDone(todo) {
    try {
      await fetch(`${API}/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: !todo.done }),
      })
      await loadAllTodos()
    } catch (e) { console.error('수정 실패:', e) }
  }

  async function deleteTodoItem(id) {
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' })
      await loadAllTodos()
    } catch (e) { console.error('삭제 실패:', e) }
  }

  async function finishEdit(todo) {
    const val = editText.trim()
    const days = editExtraDays
    setEditingId(null)
    setEditExtraDays(0)
    if (!val) { await loadAllTodos(); return }
    const prefix = todo.text.match(/^\d+ /) ? todo.text.match(/^\d+ /)[0] : ''
    const newText = prefix + val
    try {
      await fetch(`${API}/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newText, color: editColor }),
      })
      for (let i = 1; i <= days; i++) {
        const dk = addDaysToKey(selectedDate, i)
        await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dateKey: dk, text: newText, assignee: todo.assignee, color: editColor }),
        })
      }
      await loadAllTodos()
    } catch (e) { console.error('수정 실패:', e) }
  }

  async function setAssignee(todo, name) {
    try {
      await fetch(`${API}/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: name }),
      })
      setOpenPickerId(null)
      await loadAllTodos()
    } catch (e) { console.error('담당자 설정 실패:', e) }
  }

  // ── MEMBERS ──
  function saveMembers(list) {
    setMembers(list)
    saveSetting('members', list)
  }
  function addMember() {
    const name = memberInput.trim()
    if (!name || members.includes(name)) return
    saveMembers([...members, name])
    setMemberInput('')
  }
  function finishMemberEdit(oldName) {
    const newName = editMemberText.trim()
    setEditingMember(null)
    if (!newName || newName === oldName || members.includes(newName)) return
    saveMembers(members.map(m => m === oldName ? newName : m))
    // 연차 데이터 키도 함께 변경
    setVacData(prev => {
      if (!prev[oldName]) return prev
      const next = { ...prev, [newName]: prev[oldName] }
      delete next[oldName]
      return next
    })
  }

  // ── SEARCH ──
  const searchResults = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return []
    const matches = []
    Object.entries(todosMap).forEach(([dk, todos]) => {
      todos.forEach(todo => {
        if (displayText(todo.text).toLowerCase().includes(q.toLowerCase())) {
          matches.push({ dk, todo })
        }
      })
    })
    return matches.sort((a, b) => a.dk.localeCompare(b.dk))
  }, [searchQuery, todosMap])

  // ── SPAN INFO ──
  const spanInfo = useMemo(() => {
    const result = {}
    const byText = {}
    Object.entries(todosMap).forEach(([dk, todos]) => {
      todos.forEach(todo => {
        const key = displayText(todo.text)
        if (!byText[key]) byText[key] = []
        byText[key].push({ dk, id: todo.id })
      })
    })
    const SPAN_COLORS = ['#fff8e1','#e8f5e9','#e3f2fd','#fce4ec','#ede7f6','#e0f7fa','#fff3e0']
    function spanBg(text) {
      let h = 0
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) & 0xffff
      return SPAN_COLORS[h % SPAN_COLORS.length]
    }
    Object.entries(byText).forEach(([text, entries]) => {
      if (entries.length < 2) return
      entries.sort((a, b) => a.dk.localeCompare(b.dk))
      let seq = [entries[0]]
      const seqs = []
      for (let i = 1; i < entries.length; i++) {
        const [py,pm,pd] = entries[i-1].dk.split('-').map(Number)
        const [cy,cm,cd] = entries[i].dk.split('-').map(Number)
        const diff = (new Date(cy,cm-1,cd) - new Date(py,pm-1,pd)) / 86400000
        if (diff === 1) seq.push(entries[i])
        else { seqs.push(seq); seq = [entries[i]] }
      }
      seqs.push(seq)
      const bg = spanBg(text)
      seqs.forEach(sq => {
        if (sq.length < 2) return
        sq.forEach((e, i) => {
          result[e.id] = { type: i === 0 ? 'start' : i === sq.length-1 ? 'end' : 'middle', bg }
        })
      })
    })
    return result
  }, [todosMap])

  // 연차 캘린더용: 현재 멤버 + 삭제됐지만 데이터 있는 멤버
  const vacMembers = useMemo(() => {
    const extra = Object.keys(vacData).filter(n => !members.includes(n) && Object.keys(vacData[n]?.days || {}).length > 0)
    return [...members, ...extra]
  }, [members, vacData])

  // ── CALENDAR GRID ──
  const calDays = useMemo(() => {
    const firstDay = new Date(curYear, curMonth, 1).getDay()
    const lastDate = new Date(curYear, curMonth + 1, 0).getDate()
    const days = []
    // 이전 달 날짜 채우기
    const prevLastDate = new Date(curYear, curMonth, 0).getDate()
    for (let i = 0; i < firstDay; i++) {
      const d = prevLastDate - (firstDay - 1 - i)
      const prevMonth = curMonth === 0 ? 12 : curMonth
      const prevYear = curMonth === 0 ? curYear - 1 : curYear
      const dk = dateKey(prevYear, prevMonth, d)
      days.push({ empty: false, d, dk, dow: i, weekIdx: 0, faded: true, key: `prev-${dk}` })
    }
    // 현재 달 날짜
    for (let d = 1; d <= lastDate; d++) {
      const dk = dateKey(curYear, curMonth + 1, d)
      const dow = (firstDay + d - 1) % 7
      const posIdx = firstDay + d - 1
      days.push({
        empty: false, d, dk, dow,
        weekIdx: Math.floor(posIdx / 7),
        isToday: d === today.getDate() && curMonth === today.getMonth() && curYear === today.getFullYear(),
      })
    }
    // 다음 달 날짜 채우기 (마지막 주 남은 칸)
    const totalCells = days.length
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
    for (let i = 1; i <= remaining; i++) {
      const nextMonth = curMonth === 11 ? 1 : curMonth + 2
      const nextYear = curMonth === 11 ? curYear + 1 : curYear
      const dk = dateKey(nextYear, nextMonth, i)
      const posIdx = totalCells + i - 1
      days.push({ empty: false, d: i, dk, dow: (totalCells + i - 1) % 7, weekIdx: Math.floor(posIdx / 7), faded: true, key: `next-${dk}` })
    }
    return days
  }, [curYear, curMonth, today])

  // ── SLOT ASSIGNMENT (같은 줄 정렬) ──
  const slotData = useMemo(() => {
    const assignment = {} // { dk: { todoId: slotIndex } }
    const weekMaxSlots = {} // { weekIdx: count }

    const weeks = []
    let week = []
    calDays.forEach(day => {
      week.push(day)
      if (week.length === 7) { weeks.push(week); week = [] }
    })
    if (week.length > 0) weeks.push(week)

    weeks.forEach((week, wi) => {
      const validDays = week.filter(d => !d.empty)
      const occupied = [] // occupied[slot] = Set<dk>

      // 1) 스팬 할일 먼저 슬롯 배정 (같은 텍스트끼리 같은 슬롯)
      const spanGroups = {}
      validDays.forEach(day => {
        sortTodos(todosMap[day.dk] || []).forEach(todo => {
          if (spanInfo[todo.id]) {
            const key = displayText(todo.text) + '§' + spanInfo[todo.id].bg
            if (!spanGroups[key]) spanGroups[key] = []
            spanGroups[key].push({ dk: day.dk, id: todo.id })
          }
        })
      })
      Object.values(spanGroups).forEach(entries => {
        const dks = entries.map(e => e.dk)
        let s = 0
        while (dks.some(dk => occupied[s] && occupied[s].has(dk))) s++
        entries.forEach(e => {
          if (!assignment[e.dk]) assignment[e.dk] = {}
          assignment[e.dk][e.id] = s
        })
        if (!occupied[s]) occupied[s] = new Set()
        dks.forEach(dk => occupied[s].add(dk))
      })

      // 2) 나머지 할일 슬롯 채우기
      validDays.forEach(day => {
        if (!assignment[day.dk]) assignment[day.dk] = {}
        sortTodos(todosMap[day.dk] || []).forEach(todo => {
          if (assignment[day.dk][todo.id] === undefined) {
            let s = 0
            while (occupied[s] && occupied[s].has(day.dk)) s++
            assignment[day.dk][todo.id] = s
            if (!occupied[s]) occupied[s] = new Set()
            occupied[s].add(day.dk)
          }
        })
      })

      let max = 0
      validDays.forEach(day => {
        if (assignment[day.dk]) Object.values(assignment[day.dk]).forEach(s => { max = Math.max(max, s + 1) })
      })
      weekMaxSlots[wi] = max
    })

    return { assignment, weekMaxSlots }
  }, [calDays, todosMap, spanInfo])

  function openModal(dk) {
    setSelectedDate(dk)
    setNewInput('')
    setSelectedColor(TODO_COLORS[0].color)
    setEditingId(null)
    setOpenPickerId(null)
    setExtraDays(0)
    setEditExtraDays(0)
  }

  function closeModal() {
    setSelectedDate(null)
    setEditingId(null)
    setOpenPickerId(null)
  }

  function handleAssigneeBtn(e, todo) {
    e.stopPropagation()
    if (openPickerId === todo.id) { setOpenPickerId(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const pickerH = Math.min((members.length + 1) * 40 + 10, 220)
    setPickerPos({ left: rect.left, top: rect.top - pickerH - 6 })
    setOpenPickerId(todo.id)
  }

  const modalTodos = selectedDate ? sortTodos(todosMap[selectedDate] || []) : []
  const pickerTodo = openPickerId ? modalTodos.find(t => t.id === openPickerId) : null

  // ── RENDER ──
  return (
    <>
      {/* LOGIN */}
      {!isLoggedIn && (
        <div className="login-screen">
          <div className="login-box">
            <div className="login-logo">ALTTAB <span>SCHEDULE</span></div>
            <div className="login-subtitle">사무실 스케줄 관리</div>
            <div className="login-mode-label">
              {loginMode === 'guest' ? '' : '관리자 입장'}
            </div>
            <div className="login-pw-row">
              <input
                type="password"
                placeholder="비밀번호"
                maxLength={20}
                autoComplete="off"
                autoFocus
                value={loginPw}
                onChange={e => { setLoginPw(e.target.value); setLoginError('') }}
                onKeyDown={e => e.key === 'Enter' && tryLogin()}
              />
              <button className="login-enter-btn" onClick={tryLogin}>입장</button>
            </div>
            <div className="login-error">{loginError}</div>
            {loginMode === 'guest'
              ? <button className="login-admin-btn" onClick={() => { setLoginMode('admin'); setLoginPw(''); setLoginError('') }}>관리자</button>
              : <button className="login-back-btn" onClick={() => { setLoginMode('guest'); setLoginPw(''); setLoginError('') }}>← 게스트로 돌아가기</button>
            }
          </div>
        </div>
      )}

      {/* PW CHANGE */}
      {pwChangeOpen && (
        <div className="pwchange-overlay-bg" onClick={() => setPwChangeOpen(false)}>
          <div className="pwchange-box" onClick={e => e.stopPropagation()}>
            <div className="pwchange-title">🔐 비밀번호 변경</div>
            <div className="pwchange-row">
              <label>게스트 비밀번호</label>
              <input type="password" placeholder="새 비밀번호" maxLength={20} autoComplete="off"
                value={pwChangeGuest} onChange={e => setPwChangeGuest(e.target.value)} />
            </div>
            <div className="pwchange-row">
              <label>관리자 비밀번호</label>
              <input type="password" placeholder="새 비밀번호" maxLength={20} autoComplete="off"
                value={pwChangeAdmin} onChange={e => setPwChangeAdmin(e.target.value)} />
            </div>
            <div className="pwchange-msg" style={{ color: pwChangeMsg === '저장되었습니다' ? 'var(--green)' : '#c0392b' }}>{pwChangeMsg}</div>
            <div className="pwchange-actions">
              <button className="pwchange-cancel" onClick={() => { setPwChangeOpen(false); setPwChangeMsg('') }}>취소</button>
              <button className="pwchange-save" onClick={savePwChange}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="header">
        <div className="header-left">
          <div className="logo">ALTTAB <span>SCHEDULE</span></div>
          <div className="current-month-label">{curMonth + 1}월</div>
          <input
            className="header-memo"
            type="text"
            placeholder="메모..."
            maxLength={200}
            autoComplete="off"
            value={memo}
            onChange={e => { setMemo(e.target.value); saveSetting('memo', e.target.value) }}
          />
        </div>
        <div className="header-actions">
          <div className="year-picker-wrap">
            <button className="year-badge-btn" onClick={() => setYearPickerOpen(v => !v)}>{curYear}</button>
            {yearPickerOpen && (
              <div className="year-picker-popup">
                {Array.from({ length: 11 }, (_, i) => curYear - 5 + i).map(y => (
                  <button key={y} className={`year-picker-item${y === curYear ? ' active' : ''}`} onClick={() => { setCurYear(y); setCurMonth(0); setYearPickerOpen(false) }}>{y}</button>
                ))}
              </div>
            )}
          </div>
          {isAdmin && (
            <button className="admin-settings-btn" onClick={() => { setPwChangeGuest(''); setPwChangeAdmin(''); setPwChangeMsg(''); setPwChangeOpen(true) }}>
              🔐 관리자
            </button>
          )}
          <button className="add-member-btn" onClick={() => setMemberModalOpen(true)}>👤{isAdmin ? ' +' : ''}</button>
          <button className={`vac-toggle-btn${vacMode ? ' active' : ''}`} onClick={() => { setVacMode(v => !v); setVacModalDate(null) }}>연차</button>
          <button className="month-nav-btn" onClick={() => {
            if (curMonth === 0) { setCurYear(y => y - 1); setCurMonth(11) } else setCurMonth(m => m - 1)
          }}>‹</button>
          <button className="month-nav-btn" onClick={() => {
            if (curMonth === 11) { setCurYear(y => y + 1); setCurMonth(0) } else setCurMonth(m => m + 1)
          }}>›</button>
        </div>
        <div className="month-tabs" ref={monthTabsRef}>
          {MONTHS.map((m, i) => (
            <button key={m} className={i === curMonth ? 'active' : ''} onClick={() => setCurMonth(i)}>{m}</button>
          ))}
        </div>
      </div>

      {/* CALENDAR */}
      {!vacMode && <div className="calendar-wrap">
        <div className="cal-grid">
          {DAYS.map((d, i) => (
            <div key={d} className={`day-header${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{d}</div>
          ))}
          {calDays.map(day => {
            if (day.empty) return <div key={day.key} className="cal-cell empty" />
            const todos = sortTodos(todosMap[day.dk] || [])
            if (day.faded) return (
              <div key={day.key} className={`cal-cell faded${day.dow === 0 ? ' sun-cell' : day.dow === 6 ? ' sat-cell' : ''}`}>
                <span className="cell-num">{day.d}</span>
                <div className="cell-todos">
                  {todos.map(t => (
                    <div key={t.id} className={`cell-todo-item${t.done ? ' done' : ''}`}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayText(t.text)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
            const daySlots = slotData.assignment[day.dk] || {}
            const slotCount = slotData.weekMaxSlots[day.weekIdx] || 0
            const slotTodos = Array.from({ length: slotCount }, (_, s) => todos.find(t => daySlots[t.id] === s) || null)
            return (
              <div
                key={day.dk}
                className={`cal-cell${day.isToday ? ' today' : ''}${day.dow === 0 ? ' sun-cell' : day.dow === 6 ? ' sat-cell' : ''}`}
                onClick={() => openModal(day.dk)}
              >
                <span className="cell-num">{day.d}</span>
                <div className="cell-todos">
                  {slotTodos.map((t, s) => {
                    if (!t) return <div key={`sp-${s}`} className="cell-slot-spacer" />
                    const sp = spanInfo[t.id]
                    const spanCls = sp ? ` span-${sp.type}` : ''
                    const spanStyle = sp ? { backgroundColor: sp.bg, ...(t.color && !t.done ? { color: t.color } : {}) } : (t.color && !t.done ? { color: t.color } : {})
                    return (
                      <div key={t.id} className={`cell-todo-item${t.done ? ' done' : ''}${spanCls}`} style={spanStyle}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {displayText(t.text)}
                        </span>
                        {t.assignee && (
                          <span className="cell-assignee" style={t.color && !t.done ? { color: t.color } : {}}>
                            <span className="assignee-full">{t.assignee}</span>
                            <span className="assignee-short">{t.assignee.slice(0, 1)}</span>
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>}

      {/* VACATION VIEW */}
      {vacMode && (
        <div className="vac-view">
          {/* 일수등록 팝업 버튼 */}
          <button
            className={`vac-days-open-btn${vacDaysOpen ? ' open' : ''}`}
            onClick={() => setVacDaysOpen(v => !v)}
            title="일수등록"
          >▲</button>
          {vacDaysOpen && (
            <div className="vac-days-popup">
              <div className="vac-days-popup-title">일수등록</div>
              {members.length === 0
                ? <div className="vac-days-popup-empty">멤버 없음</div>
                : members.map(name => {
                  const joinDate = vacData[name]?.joinDate || ''
                  return (
                    <div key={name} className="vac-days-popup-row">
                      <div className="vac-days-popup-nameblock">
                        <span
                          className={`vac-days-popup-name${isAdmin ? ' clickable' : ''}`}
                          onClick={() => {
                            if (!isAdmin) return
                            if (joinDateEditName === name) {
                              setJoinDateEditName(null)
                            } else {
                              setJoinDateEditName(name)
                              setJoinDatePickerStep('month')
                              const existingYear = vacData[name]?.joinDate ? parseInt(vacData[name].joinDate.split('-')[0]) : new Date().getFullYear()
                              setJoinDatePickerYear(existingYear)
                              setJoinDatePickerMonth(null)
                            }
                          }}
                          title={isAdmin ? '클릭하여 입사일 설정' : ''}
                        >{name}</span>
                        {isAdmin && joinDateEditName === name && (
                          <div className="vac-join-picker">
                            {joinDatePickerStep === 'month' ? (
                              <>
                                <div className="vac-join-picker-year-row">
                                  <button className="vac-join-picker-arrow" onClick={e => { e.stopPropagation(); setJoinDatePickerYear(y => y - 1) }}>‹</button>
                                  <span className="vac-join-picker-year-val">{joinDatePickerYear}</span>
                                  <button className="vac-join-picker-arrow" onClick={e => { e.stopPropagation(); setJoinDatePickerYear(y => y + 1) }}>›</button>
                                </div>
                                <div className="vac-join-picker-months">
                                  {['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'].map((m, i) => (
                                    <button key={i} className="vac-join-picker-month-btn"
                                      onClick={e => { e.stopPropagation(); setJoinDatePickerMonth(i); setJoinDatePickerStep('day') }}>
                                      {m}
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="vac-join-picker-back-row">
                                  <button className="vac-join-picker-back-btn" onClick={e => { e.stopPropagation(); setJoinDatePickerStep('month') }}>‹ 월 선택</button>
                                  <span className="vac-join-picker-month-label">{joinDatePickerYear}년 {joinDatePickerMonth + 1}월</span>
                                </div>
                                <div className="vac-join-picker-days">
                                  {Array.from({ length: new Date(joinDatePickerYear, joinDatePickerMonth + 1, 0).getDate() }, (_, d) => (
                                    <button key={d} className="vac-join-picker-day-btn"
                                      onClick={e => {
                                        e.stopPropagation()
                                        const dk = dateKey(joinDatePickerYear, joinDatePickerMonth + 1, d + 1)
                                        vacSetJoinDate(name, dk)
                                        setJoinDateEditName(null)
                                      }}>
                                      {d + 1}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        {joinDate && <span className="vac-join-label">{joinDate}</span>}
                      </div>
                      <div className="vac-days-popup-fields">
                        <div className="vac-days-popup-field">
                          <span className="vac-days-field-label">총</span>
                          {isAdmin
                            ? <input className="vac-days-popup-input" type="text" inputMode="decimal"
                                value={getVacTotal(name)}
                                onChange={e => vacSetTotal(name, parseFloat(e.target.value) || 0)} />
                            : <span className="vac-days-popup-input vac-days-readonly">{getVacTotal(name)}</span>
                          }
                          <span className="vac-days-unit">일</span>
                        </div>
                        <div className="vac-days-popup-field">
                          <span className="vac-days-field-label">잔여</span>
                          {isAdmin
                            ? <input className="vac-days-popup-input" type="text" inputMode="decimal"
                                value={getVacRemaining(name)}
                                onChange={e => vacSetRemaining(name, parseFloat(e.target.value) || 0)} />
                            : <span className="vac-days-popup-input vac-days-readonly">{getVacRemaining(name)}</span>
                          }
                          <span className="vac-days-unit">일</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          )}
          <div className="calendar-wrap">
            <div className="cal-grid">
              {DAYS.map((d, i) => (
                <div key={d} className={`day-header${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{d}</div>
              ))}
              {calDays.map(day => {
                if (day.empty) return <div key={day.key} className="cal-cell empty" />
                if (day.faded) return (
                  <div key={day.key} className={`cal-cell faded${day.dow === 0 ? ' sun-cell' : day.dow === 6 ? ' sat-cell' : ''}`}>
                    <span className="cell-num">{day.d}</span>
                    <div className="cell-todos">
                      {vacMembers.map(name => {
                        const dayEntry = getVacDay(name, day.dk)
                        if (!dayEntry.value) return null
                        return (
                          <div key={name} className="vac-cell-row">
                            {dayEntry.value === 1
                              ? <span className="vac-cell-name">{name}</span>
                              : dayEntry.halfType === 'pm'
                                ? <span className="vac-cell-half vac-cell-pm">/{name}</span>
                                : <span className="vac-cell-half vac-cell-am">{name}/</span>
                            }
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
                return (
                  <div
                    key={day.dk}
                    className={`cal-cell${day.isToday ? ' today' : ''}${day.dow === 0 ? ' sun-cell' : day.dow === 6 ? ' sat-cell' : ''}`}
                    onClick={() => { setVacModalDate(day.dk); setVacDaysOpen(false) }}
                  >
                    <span className="cell-num">{day.d}</span>
                    <div className="cell-todos">
                      {vacMembers.map(name => {
                        const dayEntry = getVacDay(name, day.dk)
                        if (!dayEntry.value) return null
                        return (
                          <div key={name} className="vac-cell-row">
                            {dayEntry.value === 1
                              ? <span className="vac-cell-name">{name}</span>
                              : dayEntry.halfType === 'pm'
                                ? <span className="vac-cell-half vac-cell-pm">/{name}</span>
                                : <span className="vac-cell-half vac-cell-am">{name}/</span>
                            }
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* VACATION MODAL */}
      {vacMode && vacModalDate && (
        <div className="overlay-bg" onClick={e => { if (e.target === e.currentTarget) setVacModalDate(null) }}>
          <div className="modal">
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-date-label">{(() => {
                const [y, m, d] = vacModalDate.split('-')
                const dow = new Date(+y, +m - 1, +d).getDay()
                return `${+y}년 ${+m}월 ${+d}일 (${DOW_KO[dow]})`
              })()}</span>
              <button className="modal-close" onClick={() => setVacModalDate(null)}>×</button>
            </div>
            <div className="modal-body">
              {vacMembers.length === 0
                ? <div className="empty-msg">등록된 멤버가 없습니다</div>
                : vacMembers.map(name => {
                  const dayEntry = getVacDay(name, vacModalDate)
                  const remaining = getVacRemaining(name)
                  const hasEntry = (dayEntry.value || 0) > 0
                  return (
                    <div key={name} className="vac-modal-row">
                      <span className="vac-modal-name">{name}</span>
                      <span className="vac-modal-remain">총 {getVacTotal(name)}일 / 잔여 {remaining}일</span>
                      <div className="vac-modal-btns">
                        <button className="vac-add-btn" onClick={() => vacAddFull(name, vacModalDate)}>종일</button>
                        <button className={`vac-add-btn vac-add-am${dayEntry.halfType === 'am' ? ' active' : ''}`} onClick={() => vacAddHalf(name, vacModalDate, 'am')}>오전</button>
                        <button className={`vac-add-btn vac-add-pm${dayEntry.halfType === 'pm' ? ' active' : ''}`} onClick={() => vacAddHalf(name, vacModalDate, 'pm')}>오후</button>
                        {isAdmin && hasEntry && (
                          <button className="vac-remove-btn" onClick={() => vacClearDay(name, vacModalDate)}>×</button>
                        )}
                      </div>
                    </div>
                  )
                })
              }
            </div>
          </div>
        </div>
      )}

      {/* DAY MODAL */}
      {selectedDate && (
        <div className="overlay-bg" onClick={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="modal">
            <div className="modal-handle" />
            <div className="modal-header">
              <span className="modal-date-label">{(() => {
                const [y, m, d] = selectedDate.split('-')
                const dow = new Date(+y, +m - 1, +d).getDay()
                return `${+y}년 ${+m}월 ${+d}일 (${DOW_KO[dow]})`
              })()}</span>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {modalTodos.length === 0
                ? <div className="empty-msg">할일이 없습니다</div>
                : modalTodos.map(todo => (
                  <div key={todo.id} className="todo-row">
                    <div className={`todo-check${todo.done ? ' done' : ''}`} onClick={() => toggleDone(todo)} />
                    <div className="todo-main">
                      {editingId === todo.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                            {TODO_COLORS.map(({ color }) => (
                              <button key={color}
                                style={{ width: '12px', height: '12px', borderRadius: '50%', background: color, border: color === editColor ? '2px solid #555' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                                onMouseDown={e => { e.preventDefault(); setEditColor(color) }}
                              />
                            ))}
                          </div>
                          <input
                            ref={editInputRef}
                            className="todo-edit-input"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onBlur={() => finishEdit(todo)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') editInputRef.current?.blur()
                              if (e.key === 'Escape') { setEditingId(null); setEditExtraDays(0) }
                            }}
                          />
                          {editExtraDays > 0 && (
                            <span onMouseDown={e => { e.preventDefault(); setEditExtraDays(0) }}
                              style={{ fontSize: '0.68rem', color: 'var(--green)', fontWeight: 700, background: 'var(--green-muted)', borderRadius: '10px', padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              +{editExtraDays}일 ×
                            </span>
                          )}
                          <button
                            onMouseDown={e => { e.preventDefault(); setEditExtraDays(d => d + 1) }}
                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', width: '24px', height: '24px', fontSize: '0.9rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            title="하루 더 추가">+</button>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                            <span
                              className={`todo-text-span${todo.done ? ' done-text' : ''}`}
                              style={todo.color && !todo.done ? { color: todo.color } : {}}
                              onClick={() => { setEditingId(todo.id); setEditText(displayText(todo.text)); setEditColor(todo.color || TODO_COLORS[0].color) }}
                            >{displayText(todo.text)}</span>
                          </div>
                          {todo.assignee && <div className="todo-assignee">👤 {todo.assignee}</div>}
                        </>
                      )}
                    </div>
                    <div className="todo-actions">
                      <button className="icon-btn" title="담당자" onClick={e => handleAssigneeBtn(e, todo)}>👤</button>
                      <button className="icon-btn del-btn" onClick={() => deleteTodoItem(todo.id)}>×</button>
                    </div>
                  </div>
                ))
              }
            </div>
            <div className="modal-footer">
              <div className="color-dots">
                {TODO_COLORS.map(({ color }) => (
                  <button key={color}
                    className={`color-dot-btn${color === selectedColor ? ' active' : ''}`}
                    style={{ background: color }}
                    onClick={e => { e.preventDefault(); setSelectedColor(color); newInputRef.current?.focus() }}
                  />
                ))}
              </div>
              <input
                ref={newInputRef}
                type="text"
                placeholder="할일 입력 (1 회의 → 우선순위)"
                maxLength={100}
                autoComplete="off"
                value={newInput}
                onChange={e => setNewInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodo()}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {extraDays > 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--green)', fontWeight: 700, background: 'var(--green-muted)', borderRadius: '10px', padding: '2px 7px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => setExtraDays(0)}>
                    +{extraDays}일 ×
                  </span>
                )}
                <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', width: '28px', height: '28px', fontSize: '1rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  onClick={() => setExtraDays(d => d + 1)} title="하루 더 추가">+</button>
              </div>
              <button className="add-btn" onClick={addTodo}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGNEE PICKER */}
      {openPickerId && pickerTodo && (
        <div className="assignee-picker" style={{ top: pickerPos.top, left: pickerPos.left }}>
          {members.length === 0
            ? <button style={{ color: 'var(--text-muted)', cursor: 'default' }}>멤버 없음</button>
            : members.map(name => (
              <button key={name}
                className={pickerTodo.assignee === name ? 'selected' : ''}
                onClick={() => setAssignee(pickerTodo, name)}
              >{name}</button>
            ))
          }
          <button className="none-btn" onClick={() => setAssignee(pickerTodo, '')}>없음</button>
        </div>
      )}

      {/* SEARCH */}
      {searchOpen && (
        <div className="search-overlay" onClick={e => { if (e.target === e.currentTarget) { setSearchOpen(false); setSearchQuery('') } }}>
          <div className="search-box">
            <div className="search-input-row">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="할일 검색..."
                maxLength={100}
                autoComplete="off"
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setSearchOpen(false), setSearchQuery(''))}
              />
              <button className="search-close" onClick={() => { setSearchOpen(false); setSearchQuery('') }}>×</button>
            </div>
            <div className="search-results">
              {searchQuery.trim() === '' ? null
                : searchResults.length === 0
                  ? <div className="search-empty">결과 없음</div>
                  : searchResults.map(({ dk, todo }) => {
                    const [y, m, d] = dk.split('-')
                    const q = searchQuery.trim()
                    const raw = displayText(todo.text)
                    const idx = raw.toLowerCase().indexOf(q.toLowerCase())
                    return (
                      <div key={`${dk}-${todo.id}`} className="search-result-item"
                        onClick={() => {
                          setSearchOpen(false); setSearchQuery('')
                          setCurYear(+y); setCurMonth(+m - 1)
                          setTimeout(() => openModal(dk), 80)
                        }}>
                        <span className="search-result-date">{+y}.{m}.{d}</span>
                        <span className="search-result-text"
                          dangerouslySetInnerHTML={{ __html: raw.slice(0, idx) + '<mark>' + raw.slice(idx, idx + q.length) + '</mark>' + raw.slice(idx + q.length) }}
                        />
                      </div>
                    )
                  })
              }
            </div>
          </div>
        </div>
      )}

      {/* MEMBER MODAL */}
      {memberModalOpen && (
        <div className="member-overlay-bg" onClick={e => { if (e.target === e.currentTarget) setMemberModalOpen(false) }}>
          <div className="member-modal">
            <div className="modal-header" style={{ background: 'var(--beige)' }}>
              <span className="modal-date-label">👥 멤버 관리</span>
              <button className="modal-close" onClick={() => setMemberModalOpen(false)}>×</button>
            </div>
            <div className="member-list">
              {members.length === 0
                ? <div className="empty-msg">등록된 멤버가 없습니다</div>
                : members.map(name => (
                  <div key={name} className="member-item">
                    {isAdmin && editingMember === name ? (
                      <input
                        autoFocus
                        style={{ flex: 1, border: 'none', borderBottom: '1.5px solid var(--green)', outline: 'none', fontSize: '0.85rem', fontFamily: 'inherit', padding: '2px 0', background: 'transparent' }}
                        value={editMemberText}
                        onChange={e => setEditMemberText(e.target.value)}
                        onBlur={() => finishMemberEdit(name)}
                        onKeyDown={e => { if (e.key === 'Enter') finishMemberEdit(name); if (e.key === 'Escape') setEditingMember(null) }}
                      />
                    ) : (
                      <span style={{ flex: 1, cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => { if (isAdmin) { setEditingMember(name); setEditMemberText(name) } }}>👤 {name}</span>
                    )}
                    {isAdmin && <button className="del-member" onClick={() => saveMembers(members.filter(m => m !== name))}>×</button>}
                  </div>
                ))
              }
            </div>
            {isAdmin && (
            <div className="member-footer">
              <input
                type="text"
                placeholder="이름 입력"
                maxLength={20}
                autoComplete="off"
                value={memberInput}
                onChange={e => setMemberInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addMember()}
              />
              <button onClick={addMember}>추가</button>
            </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
