import seedData from '../data/mockData.json'

const STORAGE_KEY = 'school-admissions-mock-api-v1'

function createInitialDatabase() {
  const now = Date.now()

  return {
    classes: seedData.classes.map((schoolClass) => ({ ...schoolClass })),
    applications: seedData.applications.map((application) => ({
      ...application,
      expiresAt: application.expiresInSeconds
        ? new Date(now + application.expiresInSeconds * 1000).toISOString()
        : null,
    })),
  }
}

function readDatabase() {
  const savedDatabase = localStorage.getItem(STORAGE_KEY)
  if (!savedDatabase) {
    const database = createInitialDatabase()
    writeDatabase(database)
    return database
  }

  return JSON.parse(savedDatabase)
}

function writeDatabase(database) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

function createApiError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function runRequest(studentId, handler, { allowAnonymous = false } = {}) {
  const headers = studentId ? { 'X-Student-Id': studentId } : {}
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      try {
        if (!allowAnonymous && !headers['X-Student-Id']) {
          throw createApiError('শিক্ষার্থীর জন্ম নিবন্ধন নম্বর দিন।', 400)
        }
        resolve(handler(headers['X-Student-Id'] ?? ''))
      } catch (error) {
        reject(error)
      }
    }, 220)
  })
}

function requireValidStudentId(studentId) {
  if (!/^\d{17}$/.test(studentId)) {
    throw createApiError('সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।', 400)
  }
}

function expireApplications(database) {
  const now = Date.now()
  let changed = false

  database.applications.forEach((application) => {
    if (
      application.status === 'HELD' &&
      application.expiresAt &&
      new Date(application.expiresAt).getTime() <= now
    ) {
      application.status = 'EXPIRED'
      changed = true
    }
  })

  if (changed) writeDatabase(database)
}

function getClassCounts(database, schoolClass) {
  const applications = database.applications.filter(
    (application) => application.classId === schoolClass.id,
  )
  const heldSeats = applications.filter((application) => application.status === 'HELD').length
  const confirmedSeats = applications.filter(
    (application) => application.status === 'CONFIRMED',
  ).length

  return {
    ...schoolClass,
    heldSeats,
    confirmedSeats,
    availableSeats: Math.max(schoolClass.totalSeats - heldSeats - confirmedSeats, 0),
  }
}

export const mockApi = {
  getClasses(studentId) {
    return runRequest(studentId, () => {
      const database = readDatabase()
      expireApplications(database)
      return database.classes.map((schoolClass) => getClassCounts(database, schoolClass))
    }, { allowAnonymous: true })
  },

  getApplications(studentId) {
    return runRequest(studentId, (requestStudentId) => {
      requireValidStudentId(requestStudentId)
      const database = readDatabase()
      expireApplications(database)
      return database.applications
        .filter((application) => application.studentId === requestStudentId)
        .map((application) => ({
          ...application,
          className:
            database.classes.find((schoolClass) => schoolClass.id === application.classId)?.name ??
            'ক্লাস পাওয়া যায়নি',
        }))
        .sort((left, right) => {
          if (left.status === 'HELD') return -1
          if (right.status === 'HELD') return 1
          return 0
        })
    })
  },

  createClass(studentId, { name, totalSeats }) {
    return runRequest(studentId, () => {
      const database = readDatabase()
      const cleanName = name.trim()
      const seats = Number(totalSeats)

      if (!cleanName || !Number.isInteger(seats) || seats < 1 || seats > 500) {
        throw createApiError('ক্লাসের নাম ও ১–৫০০ এর মধ্যে আসনসংখ্যা দিন।', 400)
      }

      const schoolClass = {
        id: `class-${Date.now()}`,
        name: cleanName,
        grade: cleanName,
        shift: 'নতুন',
        totalSeats: seats,
      }
      database.classes.unshift(schoolClass)
      writeDatabase(database)
      return getClassCounts(database, schoolClass)
    }, { allowAnonymous: true })
  },

  applyForClass(studentId, classId) {
    return runRequest(studentId, (requestStudentId) => {
      requireValidStudentId(requestStudentId)
      const database = readDatabase()
      expireApplications(database)
      const schoolClass = database.classes.find((item) => item.id === classId)

      if (!schoolClass) throw createApiError('ক্লাসটি খুঁজে পাওয়া যায়নি।', 404)

      const existingApplication = database.applications.find(
        (application) =>
          application.studentId === requestStudentId &&
          application.classId === classId &&
          ['HELD', 'CONFIRMED'].includes(application.status),
      )
      if (existingApplication) {
        throw createApiError('এই ক্লাসে আপনার একটি আবেদন আগে থেকেই আছে।', 409)
      }

      const classCounts = getClassCounts(database, schoolClass)
      if (classCounts.availableSeats < 1) {
        throw createApiError('দুঃখিত, এই ক্লাসে আর কোনো আসন খালি নেই।', 409)
      }

      const application = {
        id: `app-${Date.now()}`,
        studentId: requestStudentId,
        classId,
        status: 'HELD',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }
      database.applications.push(application)
      writeDatabase(database)
      return { ...application, className: schoolClass.name }
    })
  },

  confirmApplication(studentId, applicationId) {
    return runRequest(studentId, (requestStudentId) => {
      requireValidStudentId(requestStudentId)
      const database = readDatabase()
      expireApplications(database)
      const application = database.applications.find(
        (item) => item.id === applicationId && item.studentId === requestStudentId,
      )

      if (!application) throw createApiError('আবেদনটি খুঁজে পাওয়া যায়নি।', 404)
      if (application.status !== 'HELD') {
        throw createApiError('এই আবেদনের সময়সীমা শেষ বা আবেদনটি আর সক্রিয় নেই।', 409)
      }

      application.status = 'CONFIRMED'
      application.expiresAt = null
      writeDatabase(database)
      return application
    })
  },

  cancelApplication(studentId, applicationId) {
    return runRequest(studentId, (requestStudentId) => {
      requireValidStudentId(requestStudentId)
      const database = readDatabase()
      expireApplications(database)
      const application = database.applications.find(
        (item) => item.id === applicationId && item.studentId === requestStudentId,
      )

      if (!application) throw createApiError('আবেদনটি খুঁজে পাওয়া যায়নি।', 404)
      if (!['HELD', 'CONFIRMED'].includes(application.status)) {
        throw createApiError('এই আবেদনটি আর বাতিল করা যাবে না।', 409)
      }

      application.status = 'CANCELLED'
      application.expiresAt = null
      writeDatabase(database)
      return application
    })
  },
}
