import { useState, useEffect, useRef } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/todos'

function App() {
  const [todos, setTodos] = useState([])
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const editRef = useRef(null)

  useEffect(() => {
    loadTodos()
  }, [])

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

  async function loadTodos() {
    try {
      const res = await fetch(API)
      const data = await res.json()
      setTodos(data)
    } catch (e) {
      console.error('불러오기 실패:', e)
    }
  }

  async function addTodo() {
    const text = input.trim()
    if (!text) return
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dateKey: 'general' }),
      })
      setInput('')
      loadTodos()
    } catch (e) {
      console.error('추가 실패:', e)
    }
  }

  async function deleteTodo(id) {
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' })
      loadTodos()
    } catch (e) {
      console.error('삭제 실패:', e)
    }
  }

  async function finishEdit(id) {
    const newText = editText.trim()
    if (newText) {
      try {
        await fetch(`${API}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: newText }),
        })
      } catch (e) {
        console.error('수정 실패:', e)
      }
    }
    setEditingId(null)
    loadTodos()
  }

  return (
    <div className="container">
      <h1 className="title">TODO</h1>

      <div className="input-row">
        <input
          className="todo-input"
          type="text"
          placeholder="할일을 입력하세요"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          maxLength={100}
          autoComplete="off"
        />
        <button className="add-btn" onClick={addTodo}>추가</button>
      </div>

      <ul className="todo-list">
        {todos.length === 0 && (
          <li className="empty-msg">할일이 없습니다</li>
        )}
        {todos.map(todo => (
          <li key={todo._id} className="todo-item">
            {editingId === todo._id ? (
              <input
                ref={editRef}
                className="edit-input"
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
                className="todo-text"
                onClick={() => { setEditingId(todo._id); setEditText(todo.text) }}
                title="클릭하여 수정"
              >
                {todo.text}
              </span>
            )}
            <button className="delete-btn" onClick={() => deleteTodo(todo._id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App
