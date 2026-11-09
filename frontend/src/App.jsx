import { useCallback, useEffect, useRef, useState } from 'react'
import { schoolApi } from './api/schoolApi'

function Icon({ name, size = 20 }) {
    const paths = {
        grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
        book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8" /></>,
        users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
        plus: <><path d="M12 5v14M5 12h14" /></>,
        search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
        clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
        bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
        close: <><path d="m18 6-12 12M6 6l12 12" /></>,
        seat: <><path d="M5 11V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6M3 19v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4M5 19v2m14-2v2" /></>,
        wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m-5 5h2" /><path d="M6 5V3h12v2" /></>,
        spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
    }

    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {paths[name]}
        </svg>
    )
}

function formatCountdown(expiresAt, now) {
    if (!expiresAt) return null
    const seconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
    const minutes = Math.floor(seconds / 60)
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function statusLabel(status) {
    return {
        HELD: 'আসন হোল্ড',
        CONFIRMED: 'ভর্তি নিশ্চিত',
        EXPIRED: 'সময় শেষ',
        CANCELLED: 'বাতিল',
    }[status] ?? status
}

function AdminSection({ classes, totalAvailable, heldCount, confirmedCount, onCreateClass, busyAction }) {
    const [className, setClassName] = useState('')
    const [totalSeats, setTotalSeats] = useState('')

    const submitClass = async (event) => {
        event.preventDefault()
        const created = await onCreateClass(className, totalSeats)
        if (created) {
            setClassName('')
            setTotalSeats('')
        }
    }

    return (
        <section className="admin-page">
            <div className="welcome-row">
                <div>
                    <div className="eyebrow"><span className="eyebrow-line" /> ADMINISTRATION</div>
                    <h1>Admin <span>প্যানেল</span></h1>
                    <p>ক্লাস ও আসন ব্যবস্থাপনা করুন। এখানে করা পরিবর্তন শিক্ষার্থী ড্যাশবোর্ডেও দেখা যাবে।</p>
                </div>
            </div>

            <section className="admin-stats">
                <article className="admin-stat"><span>মোট ক্লাস</span><strong>{classes.length}</strong></article>
                <article className="admin-stat"><span>খালি আসন</span><strong>{totalAvailable}</strong></article>
                <article className="admin-stat"><span>হোল্ডে আছে</span><strong>{heldCount}</strong></article>
                <article className="admin-stat"><span>নিশ্চিত ভর্তি</span><strong>{confirmedCount}</strong></article>
            </section>

            <div className="admin-grid">
                <section className="panel admin-create-panel">
                    <div className="panel-heading">
                        <div><span className="section-kicker">ক্লাস ব্যবস্থাপনা</span><h2>নতুন ক্লাস তৈরি</h2></div>
                        <span className="admin-panel-icon"><Icon name="plus" size={18} /></span>
                    </div>
                    <p className="admin-description">ক্লাস বা শিফটের নাম এবং মোট আসনসংখ্যা দিয়ে নতুন ভর্তি স্লট যোগ করুন।</p>
                    <form className="admin-create-form" onSubmit={submitClass}>
                        <label>ক্লাস / শিফটের নাম
                            <input required maxLength={70} value={className} onChange={(event) => setClassName(event.target.value)} placeholder="যেমন: Class 6 - Morning Shift" />
                        </label>
                        <label>মোট আসন
                            <input required min="1" max="500" type="number" value={totalSeats} onChange={(event) => setTotalSeats(event.target.value)} placeholder="যেমন: ৪০" />
                        </label>
                        <button className="button button-primary admin-submit" type="submit" disabled={busyAction === 'create-class'}>
                            <Icon name="plus" size={16} /> {busyAction === 'create-class' ? 'তৈরি হচ্ছে...' : 'ক্লাস তৈরি করুন'}
                        </button>
                    </form>
                    <div className="admin-demo-notice"><Icon name="spark" size={15} /> অ্যাসাইনমেন্ট অনুযায়ী Admin ব্যবহারের জন্য আলাদা লগইন প্রয়োজন নেই।</div>
                </section>

                <section className="panel admin-classes-panel">
                    <div className="panel-heading">
                        <div><span className="section-kicker">সকল ভর্তি স্লট</span><h2>ক্লাস তালিকা</h2></div>
                        <span className="app-total">{classes.length}</span>
                    </div>
                    <div className="admin-class-list">
                        {classes.map((schoolClass, index) => (
                            <article className="admin-class-row" key={schoolClass.id}>
                                <span className={`class-icon class-icon-${index % 4}`}><Icon name="book" size={18} /></span>
                                <span className="admin-class-name"><strong>{schoolClass.name}</strong><small>{schoolClass.shift} শিফট</small></span>
                                <span className="admin-capacity"><strong>{schoolClass.availableSeats}</strong><small>খালি / {schoolClass.totalSeats}</small></span>
                            </article>
                        ))}
                        {classes.length === 0 && <div className="empty-state"><strong>এখনো কোনো ক্লাস নেই</strong><p>উপরের ফর্ম দিয়ে প্রথম ক্লাসটি তৈরি করুন।</p></div>}
                    </div>
                </section>
            </div>
        </section>
    )
}

function App() {
    const [studentId, setStudentId] = useState(() => localStorage.getItem('school-admission-student-id') ?? '')
    const [showIdModal, setShowIdModal] = useState(false)
    const [modalStudentId, setModalStudentId] = useState('')
    const [modalIdError, setModalIdError] = useState('')
    const [classes, setClasses] = useState([])
    const [applications, setApplications] = useState([])
    const [activeTab, setActiveTab] = useState('overview')
    const [search, setSearch] = useState('')
    const [toast, setToast] = useState(null)
    const [busyAction, setBusyAction] = useState('')
    const [now, setNow] = useState(0)
    const requestSequence = useRef(0)
    const toastTimeout = useRef(null)
    const isValidStudentId = /^\d{17}$/.test(studentId)

    const notify = useCallback((message, type = 'success') => {
        setToast({ message, type })
        window.clearTimeout(toastTimeout.current)
        toastTimeout.current = window.setTimeout(() => setToast(null), 3600)
    }, [])

    const refreshData = useCallback(async () => {
        const requestId = ++requestSequence.current
        try {
            const [classResults, applicationResults] = await Promise.all([
                schoolApi.getClasses(),
                /^\d{17}$/.test(studentId) ? schoolApi.getApplications(studentId) : Promise.resolve([]),
            ])
            if (requestId !== requestSequence.current) return
            setClasses(classResults)
            setApplications(applicationResults)
        } catch (error) {
            if (requestId === requestSequence.current) {
                setToast({ message: error.message || 'তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।', type: 'error' })
            }
        }
    }, [studentId])

    useEffect(() => {
        const initialFetch = window.setTimeout(refreshData, 0)
        const pollId = window.setInterval(refreshData, 5000)
        return () => {
            window.clearTimeout(initialFetch)
            window.clearInterval(pollId)
        }
    }, [refreshData])

    useEffect(() => {
        const initialClock = window.setTimeout(() => setNow(Date.now()), 0)
        const timerId = window.setInterval(() => setNow(Date.now()), 1000)
        return () => {
            window.clearTimeout(initialClock)
            window.clearInterval(timerId)
        }
    }, [])

    useEffect(() => {
        localStorage.setItem('school-admission-student-id', studentId)
    }, [studentId])

    useEffect(() => {
        if (activeTab === 'admin') return undefined

        const sections = [
            { id: 'classes', element: document.getElementById('class-section') },
            ...(isValidStudentId
                ? [{ id: 'applications', element: document.getElementById('application-section') }]
                : []),
        ].filter((section) => section.element)
        const visibility = new Map()
        const updateActiveSection = () => {
            const visibleSections = sections
                .map(({ id, element }) => {
                    const rect = element.getBoundingClientRect()
                    const visibleHeight = Math.max(
                        0,
                        Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 69),
                    )
                    return {
                        id,
                        ratio: visibleHeight / Math.max(rect.height, 1),
                        distance: Math.abs(rect.top - 120),
                    }
                })
                .filter((section) => section.ratio > 0)
                .sort((left, right) => right.ratio - left.ratio || left.distance - right.distance)

            setActiveTab(visibleSections[0]?.id ?? 'overview')
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => visibility.set(entry.target.id, entry.isIntersecting))
                if (visibility.size) updateActiveSection()
            },
            { rootMargin: '-69px 0px 0px 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
        )
        sections.forEach(({ element }) => observer.observe(element))
        window.addEventListener('scroll', updateActiveSection, { passive: true })
        const initialUpdate = window.setTimeout(updateActiveSection, 0)

        return () => {
            observer.disconnect()
            window.removeEventListener('scroll', updateActiveSection)
            window.clearTimeout(initialUpdate)
        }
    }, [activeTab, isValidStudentId])

    useEffect(() => () => window.clearTimeout(toastTimeout.current), [])

    const performAction = async (actionId, action, successMessage) => {
        setBusyAction(actionId)
        try {
            await action()
            await refreshData()
            if (successMessage) notify(successMessage)
            return true
        } catch (error) {
            notify(error.message || 'অনুরোধটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', 'error')
            return false
        } finally {
            setBusyAction('')
        }
    }

    const handleCreateClass = async (name, seats) => {
        return performAction(
            'create-class',
            () => schoolApi.createClass(studentId, { name, totalSeats: seats }),
            'নতুন ক্লাস সফলভাবে তৈরি হয়েছে।',
        )
    }

    const filteredClasses = classes.filter((schoolClass) =>
        schoolClass.name.toLowerCase().includes(search.trim().toLowerCase()),
    )
    const heldCount = applications.filter((application) => application.status === 'HELD').length
    const confirmedCount = applications.filter(
        (application) => application.status === 'CONFIRMED',
    ).length
    const totalHeldSeats = classes.reduce((total, schoolClass) => total + schoolClass.heldSeats, 0)
    const totalConfirmedSeats = classes.reduce((total, schoolClass) => total + schoolClass.confirmedSeats, 0)
    const totalAvailable = classes.reduce((total, schoolClass) => total + schoolClass.availableSeats, 0)
    const navItems = [
        { id: 'overview', label: 'ওভারভিউ', icon: 'grid' },
        { id: 'classes', label: 'সকল ক্লাস', icon: 'book' },
        { id: 'applications', label: 'আমার আবেদন', icon: 'users', badge: heldCount || null },
        { id: 'admin', label: 'Admin', icon: 'seat' },
    ]

    const goTo = (tab) => {
        if (tab === 'applications' && !isValidStudentId) {
            setModalStudentId(studentId)
            setModalIdError('')
            setShowIdModal(true)
            return
        }
        setActiveTab(tab)
        if (tab === 'classes') document.getElementById('class-section')?.scrollIntoView({ behavior: 'smooth' })
        if (tab === 'applications') document.getElementById('application-section')?.scrollIntoView({ behavior: 'smooth' })
        if (tab === 'overview') window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const submitStudentId = (event) => {
        event.preventDefault()
        if (!/^\d{17}$/.test(modalStudentId)) {
            setModalIdError('সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।')
            return
        }

        setStudentId(modalStudentId)
        setShowIdModal(false)
        setModalIdError('')
        setActiveTab('applications')
        window.setTimeout(() => {
            document.getElementById('application-section')?.scrollIntoView({ behavior: 'smooth' })
        }, 0)
    }

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <a className="brand" href="#" onClick={(event) => { event.preventDefault(); goTo('overview') }}>
                    <span className="brand-mark"><Icon name="book" size={22} /></span>
                    <span><strong>শিক্ষা<span>দ্বার</span></strong><small>ভর্তি ব্যবস্থাপনা</small></span>
                </a>

                <div className="sidebar-label">মেনু</div>
                <nav className="side-nav" aria-label="প্রধান নেভিগেশন">
                    {navItems.filter((item) => !['admin', 'classes'].includes(item.id)).map((item) => {
                        const isActive = item.id === 'overview'
                            ? ['overview', 'classes'].includes(activeTab)
                            : activeTab === item.id

                        return (
                        <button
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.label}
                            key={item.id}
                            onClick={() => goTo(item.id)}
                        >
                            <Icon name={item.icon} size={19} />
                            <span>{item.label}</span>
                            {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                        </button>
                        )
                    })}
                </nav>
                <div className="sidebar-label admin-nav-label">Administration</div>
                <nav className="side-nav" aria-label="Admin navigation">
                    <button
                        className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
                        aria-label="Admin"
                        aria-current={activeTab === 'admin' ? 'page' : undefined}
                        title="Admin"
                        onClick={() => goTo('admin')}
                    >
                        <Icon name="seat" size={19} />
                        <span>Admin</span>
                    </button>
                </nav>

                <div className="sidebar-spacer" />
                <div className="help-card">
                    <span className="help-icon"><Icon name="spark" size={19} /></span>
                    <strong>সাহায্য প্রয়োজন?</strong>
                    <p>ভর্তি সংক্রান্ত যেকোনো তথ্যের জন্য আমাদের সাথে যোগাযোগ করুন।</p>
                    <a href="mailto:support@example.edu">যোগাযোগ করুন <Icon name="arrow" size={14} /></a>
                </div>
                <div className="sidebar-footer">
                    <span className="school-avatar">শি</span>
                    <span><strong>বিদ্যালয় পোর্টাল</strong><small>শিক্ষার্থী সেবা</small></span>
                    <span className="online-dot" />
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumb"><span>হোম</span><span className="crumb-slash">/</span><strong>{navItems.find((item) => item.id === activeTab)?.label}</strong></div>
                    <div className="topbar-actions">
                        {activeTab !== 'admin' && (
                            <label className="student-input-wrap">
                                <span className="input-prefix">ID</span>
                                <input
                                    aria-label="শিক্ষার্থীর ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর"
                                    inputMode="numeric"
                                    maxLength={17}
                                    value={studentId}
                                    onChange={(event) => setStudentId(event.target.value.replace(/\D/g, '').slice(0, 17))}
                                    placeholder="১৭ অঙ্কের জন্ম নিবন্ধন নম্বর"
                                />
                                <span className={`id-status ${isValidStudentId ? 'valid' : 'invalid'}`} title={isValidStudentId ? 'সঠিক আইডি' : '১৭ অঙ্ক লিখুন'} />
                            </label>
                        )}
                        <button className="icon-button notification-button" aria-label="বিজ্ঞপ্তি">
                            <Icon name="bell" size={19} /><i />
                        </button>
                        <div className="profile-chip"><span className="profile-avatar">শি</span><span className="profile-chevron">⌄</span></div>
                    </div>
                </header>

                <div className="page-body">
                    {activeTab === 'admin' ? (
                        <AdminSection
                            classes={classes}
                            totalAvailable={totalAvailable}
                            heldCount={totalHeldSeats}
                            confirmedCount={totalConfirmedSeats}
                            onCreateClass={handleCreateClass}
                            busyAction={busyAction}
                        />
                    ) : (
                        <>
                            <section className="welcome-row">
                                <div>
                                    <div className="eyebrow"><span className="eyebrow-line" /> ২০২৫–২৬ শিক্ষাবর্ষ</div>
                                    <h1>শিক্ষার্থী ভর্তি <span>ড্যাশবোর্ড</span></h1>
                                    <p>ক্লাস বাছাই করুন, আবেদন পরিচালনা করুন এবং আপনার ভর্তি নিশ্চিত করুন।</p>
                                </div>
                            </section>

                            <section className="hero-banner">
                                <div className="hero-copy">
                                    <span className="hero-tag"><span /> ভর্তি কার্যক্রম চলমান</span>
                                    <h2>আপনার আগামীর যাত্রা<br />শুরু হোক <em>এখান থেকেই।</em></h2>
                                    <p>পছন্দের ক্লাসে আবেদন করুন এবং নির্ধারিত সময়ের মধ্যে ভর্তি নিশ্চিত করুন।</p>
                                    <button className="hero-button" onClick={() => goTo('classes')}>ক্লাস দেখুন <Icon name="arrow" size={16} /></button>
                                </div>
                                <div className="hero-art" aria-hidden="true">
                                    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                                    <div className="art-book"><div className="book-page"><span /><span /><span /></div><div className="book-cover" /></div>
                                    <div className="art-cap">◆</div><div className="art-star star-one">✦</div><div className="art-star star-two">✧</div>
                                    <div className="art-bubble">শেখো · এগিয়ে চলো</div>
                                </div>
                            </section>

                            <section className="stats-grid" aria-label="ভর্তি পরিসংখ্যান">
                                <article className="stat-card">
                                    <span className="stat-icon icon-mint"><Icon name="book" /></span>
                                    <div className="stat-info"><span>মোট ক্লাস</span><strong>{classes.length}</strong><small><b className="text-green">●</b> আবেদন চলছে</small></div>
                                    <span className="stat-decoration">01</span>
                                </article>
                                <article className="stat-card">
                                    <span className="stat-icon icon-blue"><Icon name="seat" /></span>
                                    <div className="stat-info"><span>খালি আসন</span><strong>{totalAvailable}</strong><small>সকল ক্লাস মিলিয়ে</small></div>
                                    <span className="stat-decoration">02</span>
                                </article>
                                <article className="stat-card">
                                    <span className="stat-icon icon-amber"><Icon name="clock" /></span>
                                    <div className="stat-info"><span>অপেক্ষমাণ আবেদন</span><strong>{heldCount}</strong><small>{heldCount ? 'সময়মতো নিশ্চিত করুন' : 'কোনো আবেদন অপেক্ষমাণ নেই'}</small></div>
                                    <span className="stat-decoration">03</span>
                                </article>
                                <article className="stat-card">
                                    <span className="stat-icon icon-violet"><Icon name="check" /></span>
                                    <div className="stat-info"><span>নিশ্চিত ভর্তি</span><strong>{confirmedCount}</strong><small>আপনার সফল আবেদন</small></div>
                                    <span className="stat-decoration">04</span>
                                </article>
                            </section>

                            <section className="content-grid">
                                <div className="panel class-panel" id="class-section">
                                    <div className="panel-heading">
                                        <div><span className="section-kicker">আপনার পছন্দ বেছে নিন</span><h2>ভর্তির জন্য ক্লাস</h2></div>
                                        <button className="text-link" onClick={() => goTo('classes')}>সব ক্লাস <Icon name="arrow" size={15} /></button>
                                    </div>
                                    <div className="class-toolbar">
                                        <div className="search-box"><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ক্লাস খুঁজুন..." aria-label="ক্লাস খুঁজুন" /></div>
                                        <span className="result-count">{filteredClasses.length} টি ক্লাস</span>
                                    </div>
                                    <div className="class-list">
                                        {filteredClasses.map((schoolClass, index) => {
                                            const myApplication = applications.find(
                                                (application) => application.classId === schoolClass.id && ['HELD', 'CONFIRMED'].includes(application.status),
                                            )
                                            const availablePercent = schoolClass.totalSeats
                                                ? (schoolClass.availableSeats / schoolClass.totalSeats) * 100
                                                : 0
                                            return (
                                                <article className="class-row" key={schoolClass.id}>
                                                    <div className={`class-icon class-icon-${index % 4}`}><Icon name="book" size={20} /></div>
                                                    <div className="class-main">
                                                        <div className="class-title-line"><h3>{schoolClass.name}</h3>{myApplication && <span className={`mini-status ${myApplication.status.toLowerCase()}`}>{myApplication.status === 'HELD' ? 'আবেদন আছে' : 'নিশ্চিত'}</span>}</div>
                                                        <p>{schoolClass.grade} <span>•</span> {schoolClass.shift} শিফট</p>
                                                        <div className="seat-progress"><span style={{ width: `${Math.min(availablePercent, 100)}%` }} /></div>
                                                        <small className="seat-availability">{schoolClass.availableSeats} টি আসন খালি</small>
                                                    </div>
                                                    <div className="class-counts">
                                                        <span><b>{schoolClass.totalSeats}</b> মোট আসন</span>
                                                        <span><b className="count-held">{schoolClass.heldSeats}</b> হোল্ড</span>
                                                        <span><b className="count-confirmed">{schoolClass.confirmedSeats}</b> নিশ্চিত</span>
                                                    </div>
                                                    <button
                                                        className={`apply-button ${myApplication || schoolClass.availableSeats === 0 ? 'disabled' : ''}`}
                                                        disabled={Boolean(myApplication) || schoolClass.availableSeats === 0 || busyAction === schoolClass.id}
                                                        onClick={() => isValidStudentId
                                                            ? performAction(schoolClass.id, () => schoolApi.applyForClass(studentId, schoolClass.id), 'আপনার আসন নির্ধারিত সময়ের জন্য হোল্ড করা হয়েছে।')
                                                            : goTo('applications')}
                                                    >
                                                        {myApplication ? (myApplication.status === 'HELD' ? 'আবেদন করা' : 'ভর্তি নিশ্চিত') : 'আবেদন করুন'}{!myApplication && <Icon name="arrow" size={15} />}
                                                    </button>
                                                </article>
                                            )
                                        })}
                                        {filteredClasses.length === 0 && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={22} /></span><strong>কোনো ক্লাস পাওয়া যায়নি</strong><p>অন্য কোনো নাম দিয়ে খুঁজে দেখুন।</p></div>}
                                    </div>
                                    {!isValidStudentId && <div className="inline-notice">আবেদন করতে উপরে ১৭ অঙ্কের সঠিক জন্ম নিবন্ধন নম্বর লিখুন।</div>}
                                </div>

                                <aside className="panel application-panel" id="application-section">
                                    <div className="panel-heading application-heading">
                                        <div><span className="section-kicker">আপনার ভর্তি অগ্রগতি</span><h2>আমার আবেদন</h2></div>
                                        <span className="app-total">{applications.length}</span>
                                    </div>
                                    {!isValidStudentId ? (
                                        <div className="empty-state compact"><span className="empty-icon"><Icon name="users" size={21} /></span><strong>আবেদন দেখতে Student ID প্রয়োজন</strong><p>আপনার ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিয়ে পরিচয় যাচাই করুন।</p><button className="text-link" onClick={() => goTo('applications')}>Student ID দিন <Icon name="arrow" size={14} /></button></div>
                                    ) : applications.length === 0 ? (
                                        <div className="empty-state compact"><span className="empty-icon"><Icon name="book" size={21} /></span><strong>এখনো কোনো আবেদন নেই</strong><p>পছন্দের ক্লাসে আবেদন করলে এখানে দেখা যাবে।</p><button className="text-link" onClick={() => goTo('classes')}>ক্লাস বেছে নিন <Icon name="arrow" size={14} /></button></div>
                                    ) : (
                                        <div className="application-list">
                                            {applications.map((application) => {
                                                const countdown = application.status === 'HELD' ? formatCountdown(application.expiresAt, now) : null
                                                const expiredLocally = application.status === 'HELD' && countdown === '00:00'
                                                const visibleStatus = expiredLocally ? 'EXPIRED' : application.status
                                                return (
                                                    <article className="application-card" key={application.id}>
                                                        <div className="application-card-top">
                                                            <span className={`app-status ${visibleStatus.toLowerCase()}`}><i />{statusLabel(visibleStatus)}</span>
                                                            {application.status === 'HELD' && <span className={`countdown ${expiredLocally ? 'expired' : ''}`}><Icon name="clock" size={14} />{countdown}</span>}
                                                        </div>
                                                        <h3>{application.className}</h3>
                                                        <p className="application-id">আবেদন নং: <span>{application.id.slice(-8).toUpperCase()}</span></p>
                                                        {application.status === 'HELD' && (
                                                            <div className="application-actions">
                                                                <button
                                                                    className="button button-pay"
                                                                    disabled={expiredLocally || busyAction === application.id}
                                                                    onClick={() => performAction(application.id, () => schoolApi.confirmApplication(studentId, application.id), 'সফল! আপনার ভর্তি নিশ্চিত হয়েছে।')}
                                                                ><Icon name="wallet" size={16} /> ভর্তি ফি দিন</button>
                                                                <button className="cancel-button" disabled={busyAction === application.id} onClick={() => performAction(application.id, () => schoolApi.cancelApplication(studentId, application.id), 'আপনার আবেদন বাতিল করা হয়েছে।')}>বাতিল</button>
                                                            </div>
                                                        )}
                                                        {application.status === 'CONFIRMED' && (
                                                            <div className="confirmed-note"><Icon name="check" size={15} /> ভর্তি সফলভাবে নিশ্চিত হয়েছে
                                                                <button className="cancel-button" disabled={busyAction === application.id} onClick={() => performAction(application.id, () => schoolApi.cancelApplication(studentId, application.id), 'আপনার আবেদন বাতিল করা হয়েছে।')}>বাতিল</button>
                                                            </div>
                                                        )}
                                                        {['EXPIRED', 'CANCELLED'].includes(application.status) && <div className="closed-note">{application.status === 'EXPIRED' ? 'হোল্ডের সময়সীমা শেষ হয়েছে।' : 'এই আবেদনটি বাতিল করা হয়েছে।'}</div>}
                                                    </article>
                                                )
                                            })}
                                        </div>
                                    )}
                                    <div className="secure-note"><span><Icon name="check" size={13} /></span> আপনার তথ্য নিরাপদ ও গোপনীয়</div>
                                </aside>
                            </section>

                            <footer className="page-footer"><span>© ২০২৫ শিক্ষাদ্বার · ভর্তি ব্যবস্থাপনা</span><span>সাহায্য লাগবে? <a href="mailto:support@example.edu">যোগাযোগ করুন</a></span></footer>
                        </>
                    )}
                </div>
            </main>

            {showIdModal && (
                <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowIdModal(false) }}>
                    <section className="student-id-modal" role="dialog" aria-modal="true" aria-labelledby="student-id-modal-title">
                        <button className="modal-close" onClick={() => setShowIdModal(false)} aria-label="বন্ধ করুন"><Icon name="close" size={18} /></button>
                        <span className="modal-icon"><Icon name="users" size={22} /></span>
                        <h2 id="student-id-modal-title">আপনার পরিচয় যাচাই করুন</h2>
                        <p>আবেদন দেখতে বা পরিচালনা করতে ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর দিন।</p>
                        <form onSubmit={submitStudentId}>
                            <label htmlFor="modal-student-id">জন্ম নিবন্ধন নম্বর</label>
                            <input
                                autoFocus
                                id="modal-student-id"
                                inputMode="numeric"
                                maxLength={17}
                                value={modalStudentId}
                                onChange={(event) => {
                                    setModalStudentId(event.target.value.replace(/\D/g, '').slice(0, 17))
                                    setModalIdError('')
                                }}
                                placeholder="১৭ অঙ্কের নম্বর লিখুন"
                                aria-invalid={Boolean(modalIdError)}
                                aria-describedby={modalIdError ? 'modal-id-error' : undefined}
                            />
                            <div className="modal-input-meta">
                                {modalIdError ? <span id="modal-id-error" className="modal-error">{modalIdError}</span> : <span>শুধু সংখ্যা লিখুন</span>}
                                <span>{modalStudentId.length}/17</span>
                            </div>
                            <button className="button button-primary modal-submit" type="submit">যাচাই করে এগিয়ে যান <Icon name="arrow" size={16} /></button>
                        </form>
                        <button className="modal-cancel" onClick={() => setShowIdModal(false)}>এখন নয়</button>
                    </section>
                </div>
            )}
            {toast && <div className={`toast toast-${toast.type}`} role="status"><span className="toast-icon"><Icon name={toast.type === 'error' ? 'close' : 'check'} size={17} /></span><span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="বার্তা বন্ধ করুন"><Icon name="close" size={15} /></button></div>}
        </div>
    )
}

export default App
