const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const STUDENT_ID_PATTERN = /^\d{17}$/

function getStudentHeaders(studentId) {
  if (!STUDENT_ID_PATTERN.test(studentId ?? '')) {
    throw new Error('সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।')
  }

  return { 'X-Student-Id': studentId }
}

function mapClass(schoolClass) {
  const namedShift = schoolClass.name.match(/^(.*?)\s*[-–—]\s*(.*?)\s+Shift$/i)

  return {
    ...schoolClass,
    grade: namedShift?.[1] ?? schoolClass.name,
    shift: namedShift?.[2] ?? 'নতুন',
  }
}

async function request(path, { headers, ...options } = {}) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    })
  } catch {
    throw new Error('সার্ভারের সাথে সংযোগ করা যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।')
  }

  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') ?? ''
  const responseBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = typeof responseBody === 'object' && responseBody !== null
      ? responseBody.message ?? responseBody.detail
      : responseBody
    throw new Error(message || `অনুরোধটি সম্পন্ন করা যায়নি (${response.status})।`)
  }

  return responseBody
}

export const schoolApi = {
  async getClasses() {
    const classes = await request('/classes')
    return classes.map(mapClass)
  },

  async getApplications(studentId) {
    const holds = await request('/me/holds', {
      headers: getStudentHeaders(studentId),
    })
    return holds.map((hold) => ({
      ...hold,
      id: hold.holdId,
    }))
  },

  async createClass(_studentId, { name, totalSeats }) {
    const schoolClass = await request('/classes', {
      method: 'POST',
      body: JSON.stringify({ name, totalSeats: Number(totalSeats) }),
    })
    return mapClass(schoolClass)
  },

  async updateClass(classId, { name, totalSeats }) {
    const schoolClass = await request(`/classes/${encodeURIComponent(classId)}`, {
      method: 'PUT',
      body: JSON.stringify({ name, totalSeats: Number(totalSeats) }),
    })
    return mapClass(schoolClass)
  },

  async deleteClass(classId) {
    return request(`/classes/${encodeURIComponent(classId)}`, {
      method: 'DELETE',
    })
  },

  async applyForClass(studentId, classId) {
    const hold = await request(`/classes/${encodeURIComponent(classId)}/holds`, {
      method: 'POST',
      headers: getStudentHeaders(studentId),
    })
    return { ...hold, id: hold.holdId }
  },

  async confirmApplication(studentId, holdId) {
    return request(`/holds/${encodeURIComponent(holdId)}/confirm`, {
      method: 'POST',
      headers: getStudentHeaders(studentId),
    })
  },

  async cancelApplication(studentId, holdId) {
    return request(`/holds/${encodeURIComponent(holdId)}`, {
      method: 'DELETE',
      headers: getStudentHeaders(studentId),
    })
  },
}
