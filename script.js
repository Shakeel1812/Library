/**
 * Library Management System - Fixed Frontend & Auth logic
 */

const API_URL = 'http://localhost:3000/api';
const VALID_USERNAME = 'library';
const VALID_PASSWORD = 'college123';

// Local data storage
let books = [];
let students = [];
let notificationTimeout = null;
let selectedLoginRole = '';
let currentBookSearchQuery = '';

// ==================== INITIALIZATION ====================

window.addEventListener('load', function() {
    setupTableActionHandlers();
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    if (isLoggedIn === 'true') {
        showMainApp();
    } else {
        showLoginPage();
    }
});

// ==================== AUTH MANAGEMENT ====================

async function handleLogin(event) {
    event.preventDefault();
    
    const usernameField = document.getElementById('loginUsername');
    const passwordField = document.getElementById('loginPassword');
    const errorDiv = document.getElementById('loginError');

    const inputVal = usernameField.value.trim();
    const inputPass = passwordField.value.trim();

    if (!selectedLoginRole) {
        errorDiv.textContent = '❌ Please choose Student Login or Admin Login first.';
        errorDiv.classList.add('show');
        return;
    }
    
    // 1. Student login must match admin-registered student records
    if (selectedLoginRole === 'student') {
        const studentRecords = await fetchAPI('/students');
        const normalizedInputName = inputVal.toLowerCase();

        const matchedStudent = Array.isArray(studentRecords)
            ? studentRecords.find((student) => {
                const studentName = String(student.name || '').trim().toLowerCase();
                const studentId = String(student.student_id || '').trim();
                return studentName === normalizedInputName && studentId === inputPass;
            })
            : null;

        if (matchedStudent) {
            loginSuccess({ id: matchedStudent.student_id, name: matchedStudent.name, type: 'student' });
        } else {
            errorDiv.textContent = '❌ Invalid student credentials. Use Student Name as username and Student ID as password.';
            errorDiv.classList.add('show');
        }
        return;
    }

    // 2. Check Hardcoded Admin Account
    if (selectedLoginRole === 'admin' && inputVal === VALID_USERNAME && inputPass === VALID_PASSWORD) {
        loginSuccess({ id: VALID_USERNAME, name: 'Admin' });
        return;
    }

    // 3. Check LocalStorage for registered admin users
    const users = JSON.parse(localStorage.getItem('users') || '[]');

    const foundUser = users.find(
        u => (u.id === inputVal || u.name === inputVal || u.username === inputVal) &&
             u.password === inputPass &&
             u.type === 'admin'
    );

    if (foundUser) {
        loginSuccess(foundUser);
    } else {
        errorDiv.textContent = `❌ Invalid ${selectedLoginRole} credentials! Try ID or Name.`;
        errorDiv.classList.add('show');
    }

    function loginSuccess(user) {
        completeLogin(user);
        usernameField.value = '';
        passwordField.value = '';
        errorDiv.classList.remove('show');
    }
}

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.setItem('isLoggedIn', 'false');
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('currentUserName');
        localStorage.removeItem('currentStudentBorrowedCount');
        showLoginPage();
    }
}

function completeLogin(user = null) {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('loginRole', selectedLoginRole || '');
    localStorage.setItem('currentStudentBorrowedCount', '0');

    if (user && user.id) {
        localStorage.setItem('currentUserId', String(user.id));
        localStorage.setItem('currentUserName', String(user.name || user.username || user.id));
    } else {
        localStorage.removeItem('currentUserId');
        localStorage.removeItem('currentUserName');
    }

    const errorDiv = document.getElementById('loginError');
    if (errorDiv) errorDiv.classList.remove('show');
    showMainApp();
}

function showSignupPage(event) {
    if (event) event.preventDefault();
    document.body.classList.add('auth-page');
    document.body.classList.remove('main-app-visible');
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'flex';
    if(document.getElementById('mainApp')) document.getElementById('mainApp').style.display = 'none';
    setSignupRole('student');
}

function openSignupAs(role) {
    showSignupPage();
    setSignupRole(role);
}

function showLoginPage(event) {
    if (event) event.preventDefault();
    document.body.classList.add('auth-page');
    document.body.classList.remove('main-app-visible');
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    if(document.getElementById('mainApp')) document.getElementById('mainApp').style.display = 'none';
    resetLoginRole();
}

function selectLoginRole(role) {
    selectedLoginRole = role;

    const loginPortalGrid = document.getElementById('loginPortalGrid');
    const roleLoginForm = document.getElementById('roleLoginForm');
    const selectedRolePill = document.getElementById('selectedRolePill');
    const loginError = document.getElementById('loginError');

    if (loginPortalGrid) loginPortalGrid.style.display = 'none';
    if (roleLoginForm) roleLoginForm.style.display = 'flex';
    if (selectedRolePill) selectedRolePill.textContent = role === 'student' ? 'Student Login' : 'Admin Login';
    if (loginError) loginError.classList.remove('show');
}

function resetLoginRole() {
    selectedLoginRole = '';

    const loginPortalGrid = document.getElementById('loginPortalGrid');
    const roleLoginForm = document.getElementById('roleLoginForm');
    const loginError = document.getElementById('loginError');
    const usernameField = document.getElementById('loginUsername');
    const passwordField = document.getElementById('loginPassword');

    if (loginPortalGrid) loginPortalGrid.style.display = 'grid';
    if (roleLoginForm) roleLoginForm.style.display = 'none';
    if (loginError) loginError.classList.remove('show');
    if (usernameField) usernameField.value = '';
    if (passwordField) passwordField.value = '';
}

function showMainApp() {
    document.body.classList.remove('auth-page');
    document.body.classList.add('main-app-visible');
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'none';
    
    const mainApp = document.getElementById('mainApp');
    if(mainApp) {
        mainApp.classList.remove('app-hidden');
        mainApp.style.display = 'block';
    }

    applyRoleBasedVisibility();
    
    loadDashboard();
    loadBooks();
    loadStudents();
    loadMyTransactions();
}

function getCurrentLoginRole() {
    return selectedLoginRole || localStorage.getItem('loginRole') || '';
}

function applyRoleBasedVisibility() {
    const isStudentView = getCurrentLoginRole() === 'student';

    const studentsTabButton = document.getElementById('studentsTabButton');
    const studentPortalSection = document.getElementById('studentPortalSection');
    const adminBookSection = document.getElementById('adminBookManagementSection');
    const registrationSection = document.getElementById('adminStudentRegistrationSection');
    const studentsListSection = document.getElementById('adminStudentsListSection');
    const adminBorrowActionsSection = document.getElementById('adminBorrowActionsSection');
    const borrowLookupSection = document.getElementById('studentBorrowLookupSection');
    const studentMyActivitySection = document.getElementById('studentMyActivitySection');
    const registeredStudentsCard = document.getElementById('registeredStudentsCard');

    if (studentsTabButton) studentsTabButton.style.display = isStudentView ? 'none' : '';
    if (studentPortalSection) studentPortalSection.style.display = isStudentView ? '' : 'none';
    if (adminBookSection) adminBookSection.style.display = isStudentView ? 'none' : '';
    if (registrationSection) registrationSection.style.display = isStudentView ? 'none' : '';
    if (studentsListSection) studentsListSection.style.display = isStudentView ? 'none' : '';
    if (adminBorrowActionsSection) adminBorrowActionsSection.style.display = isStudentView ? 'none' : '';
    if (borrowLookupSection) borrowLookupSection.style.display = isStudentView ? 'none' : '';
    if (studentMyActivitySection) studentMyActivitySection.style.display = isStudentView ? '' : 'none';
    if (registeredStudentsCard) registeredStudentsCard.style.display = isStudentView ? 'none' : '';
}

function setupTableActionHandlers() {
    const booksList = document.getElementById('booksList');
    if (booksList) {
        booksList.addEventListener('click', function(event) {
            const removeBtn = event.target.closest('button[data-action="remove-book"]');
            if (!removeBtn) return;
            const bookId = removeBtn.dataset.bookId;
            if (bookId) removeBook(bookId);
        });
    }

    const membersList = document.getElementById('membersList');
    if (membersList) {
        membersList.addEventListener('click', function(event) {
            const removeBtn = event.target.closest('button[data-action="remove-student"]');
            if (!removeBtn) return;
            const studentId = removeBtn.dataset.studentId;
            if (studentId) removeStudent(studentId);
        });
    }
}

async function removeBook(bookId) {
    const ok = confirm(`Remove book ${bookId}?`);
    if (!ok) return;

    const result = await fetchAPI(`/books/${encodeURIComponent(bookId)}`, 'DELETE');
    if (!result) {
        alert('❌ Failed to remove book');
        return;
    }

    books = books.filter(book => book.book_id !== bookId);
    updateBooksTable();
    loadDashboard();
}

async function removeStudent(studentId) {
    const ok = confirm(`Remove student ${studentId}?`);
    if (!ok) return;

    const result = await fetchAPI(`/students/${encodeURIComponent(studentId)}`, 'DELETE');
    if (!result) {
        alert('❌ Failed to remove student');
        return;
    }

    students = students.filter(student => student.student_id !== studentId);
    updateMembersTable();
    loadDashboard();
}

// ==================== SIGNUP LOGIC ====================

function updateSignupFields() {
    const userTypeInput = document.getElementById('signupUserType');
    if (!userTypeInput) return;
    const userType = userTypeInput.value;
    const courseDiv = document.getElementById('studentCourseDiv');
    const courseSelect = document.getElementById('signupCourse');
    if(courseDiv) {
        courseDiv.style.display = (userType === 'student') ? 'block' : 'none';
    }
    if (courseSelect) {
        const isStudent = userType === 'student';
        courseSelect.required = isStudent;
        if (!isStudent) courseSelect.value = '';
    }
}

function setSignupRole(role) {
    const userTypeInput = document.getElementById('signupUserType');
    const titleEl = document.getElementById('signupTitle');
    const studentBtn = document.getElementById('signupStudentBtn');
    const adminBtn = document.getElementById('signupAdminBtn');
    const idField = document.getElementById('signupID');
    if (!userTypeInput) return;

    userTypeInput.value = role;

    if (titleEl) {
        titleEl.textContent = role === 'student' ? 'Create Student Account' : 'Create Admin Account';
    }

    if (studentBtn && adminBtn) {
        studentBtn.classList.toggle('active', role === 'student');
        adminBtn.classList.toggle('active', role === 'admin');
    }

    if (idField) {
        idField.placeholder = role === 'student' ? 'e.g., STU12345' : 'e.g., ADM001';
    }

    updateSignupFields();
}

function handleSignup(event) {
    event.preventDefault();
    
    const userType = document.getElementById('signupUserType').value;
    const userId = document.getElementById('signupID').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const userName = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const course = document.getElementById('signupCourse').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    const errorDiv = document.getElementById('signupError');
    
    if (password !== confirmPassword) {
        errorDiv.textContent = '❌ Passwords do not match';
        errorDiv.classList.add('show');
        return;
    }

    if (!userType) {
        errorDiv.textContent = '❌ Please select signup role';
        errorDiv.classList.add('show');
        return;
    }

    if (userType === 'student' && !course) {
        errorDiv.textContent = '❌ Please select course for student';
        errorDiv.classList.add('show');
        return;
    }
    
    let users = JSON.parse(localStorage.getItem('users') || '[]');
    if (users.some(u => u.id === userId || u.username === username || u.email === email)) {
        errorDiv.textContent = '❌ ID, username, or email already registered';
        errorDiv.classList.add('show');
        return;
    }
    
    // Save new user
    users.push({ 
        type: userType, 
        id: userId, 
        username: username,
        name: userName, 
        email: email, 
        password: password, 
        course: course 
    });
    
    localStorage.setItem('users', JSON.stringify(users));
    
    errorDiv.textContent = '✅ Success! Redirecting to login...';
    errorDiv.classList.add('show', 'success');
    
    setTimeout(() => {
        showLoginPage();
        errorDiv.classList.remove('show', 'success');
    }, 2000);
}

// ==================== API FUNCTIONS ====================

async function fetchAPI(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (data) options.body = JSON.stringify(data);
        
        const response = await fetch(`${API_URL}${endpoint}`, options);
        if(!response.ok) return null;
        const result = await response.json();
        return result.data || result;
    } catch (error) {
        console.error('API Error:', error);
        return null;
    }
}

async function getCurrentStudentBorrowedCountFromServer() {
    if (getCurrentLoginRole() !== 'student') return 0;

    const studentId = localStorage.getItem('currentUserId') || '';
    if (!studentId) {
        updateStudentBorrowedCount(0);
        return 0;
    }

    const history = await fetchAPI(`/transactions/${encodeURIComponent(studentId)}`);
    const count = Array.isArray(history) ? calculateCurrentBorrowedCount(history) : 0;
    updateStudentBorrowedCount(count);
    return count;
}

async function loadDashboard() {
    const data = await fetchAPI('/dashboard');
    if (data) {
        if(document.getElementById('totalBooks')) document.getElementById('totalBooks').textContent = data.total_books || 0;
        if(document.getElementById('availableBooks')) document.getElementById('availableBooks').textContent = data.available_books || 0;
        if(document.getElementById('borrowedBooks')) document.getElementById('borrowedBooks').textContent = data.books_borrowed || 0;
        if(document.getElementById('totalMembers')) document.getElementById('totalMembers').textContent = data.total_students || 0;
    }

    if (getCurrentLoginRole() === 'student') {
        const myBorrowedCount = await getCurrentStudentBorrowedCountFromServer();
        const borrowedBooksEl = document.getElementById('borrowedBooks');
        if (borrowedBooksEl) borrowedBooksEl.textContent = String(myBorrowedCount);
    }

    renderStudentPortal();
}

async function loadBooks() {
    const data = await fetchAPI('/books');
    if (data) {
        books = data;
        updateBooksTable();
        renderStudentPortal();
    }
}

async function loadStudents() {
    if (getCurrentLoginRole() === 'student') {
        students = [];
        updateMembersTable();
        return;
    }

    const data = await fetchAPI('/students');
    if (data) {
        students = data;
        updateMembersTable();
        renderStudentPortal();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.classList.remove('success', 'error', 'info', 'show');
    notification.classList.add(type, 'show');

    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    notificationTimeout = setTimeout(() => {
        notification.classList.remove('show');
    }, 2500);
}

async function addBook(event) {
    event.preventDefault();

    const bookIdField = document.getElementById('bookId');
    const titleField = document.getElementById('bookTitle');
    const authorField = document.getElementById('bookAuthor');
    const quantityField = document.getElementById('bookQuantity');

    const quantityValue = Number.parseInt(quantityField.value, 10);
    const payload = {
        book_id: bookIdField.value.trim(),
        title: titleField.value.trim(),
        author: authorField.value.trim(),
        quantity: quantityValue
    };

    if (!payload.book_id || !payload.title || !payload.author || Number.isNaN(payload.quantity) || payload.quantity <= 0) {
        showNotification('❌ Please fill all book fields correctly', 'error');
        return;
    }

    const createdBook = await fetchAPI('/books', 'POST', payload);
    if (!createdBook) {
        showNotification('❌ Failed to add book (ID may already exist)', 'error');
        return;
    }

    books.push({
        total_quantity: createdBook.total_quantity ?? payload.quantity,
        available_quantity: createdBook.available_quantity ?? payload.quantity,
        ...createdBook
    });
    updateBooksTable();
    loadDashboard();

    event.target.reset();
    showNotification('✅ Book added successfully', 'success');
}

async function addStudent(event) {
    event.preventDefault();

    const studentIdField = document.getElementById('memberId');
    const nameField = document.getElementById('memberName');
    const emailField = document.getElementById('memberEmail');
    const courseField = document.getElementById('memberCourse');

    const payload = {
        student_id: studentIdField.value.trim(),
        name: nameField.value.trim(),
        email: emailField.value.trim(),
        course: courseField.value
    };

    if (!payload.student_id || !payload.name || !payload.email || !payload.course) {
        showNotification('❌ Please fill all student fields', 'error');
        return;
    }

    const createdStudent = await fetchAPI('/students', 'POST', payload);
    if (!createdStudent) {
        showNotification('❌ Failed to register student (ID may already exist)', 'error');
        return;
    }

    students.push({
        books_borrowed: [],
        ...createdStudent
    });
    updateMembersTable();
    loadDashboard();

    event.target.reset();
    showStudentProfileModal(createdStudent);
    showNotification('✅ Student registered successfully', 'success');
}

function showStudentProfileModal(student) {
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;

    const nameEl = document.getElementById('studentModalName');
    const idEl = document.getElementById('studentModalId');
    const statusEl = document.getElementById('studentModalStatus');
    const courseTagEl = document.getElementById('studentModalCourse');
    const headingEl = document.getElementById('studentModalHeading');
    const primaryLabelEl = document.getElementById('studentModalPrimaryLabel');
    const primaryValueEl = document.getElementById('studentModalPrimaryValue');
    const secondaryLabelEl = document.getElementById('studentModalSecondaryLabel');
    const secondaryValueEl = document.getElementById('studentModalSecondaryValue');

    if (nameEl) nameEl.textContent = student.name || 'Student';
    if (idEl) idEl.textContent = student.student_id || '-';
    if (statusEl) statusEl.textContent = 'New Student';
    if (courseTagEl) courseTagEl.textContent = student.course || '-';
    if (headingEl) headingEl.textContent = 'Contact Information';
    if (primaryLabelEl) primaryLabelEl.textContent = 'Email';
    if (primaryValueEl) primaryValueEl.textContent = student.email || '-';
    if (secondaryLabelEl) secondaryLabelEl.textContent = 'Course';
    if (secondaryValueEl) secondaryValueEl.textContent = student.course || '-';

    modal.classList.add('show');
}

function showTransactionProfileModal(action, studentId, bookId, result = {}) {
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;

    const student = students.find((item) => item.student_id === studentId) || {};
    const book = books.find((item) => item.book_id === bookId) || {};

    const nameEl = document.getElementById('studentModalName');
    const idEl = document.getElementById('studentModalId');
    const statusEl = document.getElementById('studentModalStatus');
    const courseTagEl = document.getElementById('studentModalCourse');
    const headingEl = document.getElementById('studentModalHeading');
    const primaryLabelEl = document.getElementById('studentModalPrimaryLabel');
    const primaryValueEl = document.getElementById('studentModalPrimaryValue');
    const secondaryLabelEl = document.getElementById('studentModalSecondaryLabel');
    const secondaryValueEl = document.getElementById('studentModalSecondaryValue');

    const studentName = result.student_name || student.name || 'Student';
    const studentCourse = student.course || '-';
    const studentEmail = student.email || '-';
    const bookTitle = result.book_title || book.title || 'Book';

    if (nameEl) nameEl.textContent = studentName;
    if (idEl) idEl.textContent = studentId || '-';
    if (statusEl) statusEl.textContent = `${action} Completed`;
    if (courseTagEl) courseTagEl.textContent = studentCourse;
    if (headingEl) headingEl.textContent = 'Transaction Information';
    if (primaryLabelEl) primaryLabelEl.textContent = 'Email';
    if (primaryValueEl) primaryValueEl.textContent = studentEmail;
    if (secondaryLabelEl) secondaryLabelEl.textContent = 'Book';
    if (secondaryValueEl) secondaryValueEl.textContent = `${bookId} - ${bookTitle}`;

    modal.classList.add('show');
}

function closeStudentProfileModal() {
    const modal = document.getElementById('studentProfileModal');
    if (!modal) return;
    modal.classList.remove('show');
}

// ==================== UI TABLES & TABS ====================

function showTab(tabName) {
    if (getCurrentLoginRole() === 'student' && tabName === 'students') {
        tabName = 'books';
    }

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(tabName);
    if(targetTab) targetTab.classList.add('active');
    
    if (event && event.target) event.target.classList.add('active');
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'students') renderStudentPortal();
    if (tabName === 'borrow') loadMyTransactions();
}

function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

function calculateCurrentBorrowedCount(history = []) {
    const activeBorrowedBookIds = new Set();

    [...history].reverse().forEach((item) => {
        const bookId = String(item.book_id || '').trim();
        const action = String(item.action || '').toLowerCase();

        if (!bookId) return;

        if (action === 'borrow') {
            activeBorrowedBookIds.add(bookId);
        } else if (action === 'return') {
            activeBorrowedBookIds.delete(bookId);
        }
    });

    return activeBorrowedBookIds.size;
}

function updateStudentBorrowedCount(count) {
    const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;
    localStorage.setItem('currentStudentBorrowedCount', String(safeCount));

    const borrowedCountEl = document.getElementById('studentPortalBorrowedCount');
    if (borrowedCountEl && getCurrentLoginRole() === 'student') {
        borrowedCountEl.textContent = String(safeCount);
    }
}

async function loadMyTransactions() {
    if (getCurrentLoginRole() !== 'student') return;

    const tbody = document.getElementById('studentActivityBody');
    const emptyState = document.getElementById('studentActivityEmpty');
    if (!tbody || !emptyState) return;

    const studentId = localStorage.getItem('currentUserId') || '';
    if (!studentId) {
        tbody.innerHTML = '';
        updateStudentBorrowedCount(0);
        emptyState.textContent = 'Please log in again to load your transaction history.';
        emptyState.style.display = 'block';
        return;
    }

    const history = await fetchAPI(`/transactions/${encodeURIComponent(studentId)}`);
    if (!history || history.length === 0) {
        tbody.innerHTML = '';
        updateStudentBorrowedCount(0);
        emptyState.textContent = 'No transaction history available.';
        emptyState.style.display = 'block';
        return;
    }

    updateStudentBorrowedCount(calculateCurrentBorrowedCount(history));

    emptyState.style.display = 'none';
    tbody.innerHTML = history.map((item) => `
        <tr>
            <td>${String(item.action || '-').toUpperCase()}</td>
            <td>${item.book_id || '-'}</td>
            <td>${item.book_title || '-'}</td>
            <td>${formatDateTime(item.date)}</td>
        </tr>
    `).join('');
}

function renderStudentPortal() {
    const totalBooksEl = document.getElementById('studentPortalTotalBooks');
    const availableCountEl = document.getElementById('studentPortalAvailableCount');
    const borrowedCountEl = document.getElementById('studentPortalBorrowedCount');
    const availableBooksGrid = document.getElementById('studentPortalAvailableBooks');

    if (!totalBooksEl || !availableCountEl || !borrowedCountEl || !availableBooksGrid) return;

    const totalBooks = books.reduce((sum, book) => sum + (Number(book.total_quantity) || 0), 0);
    const availableBooks = books.reduce((sum, book) => sum + (Number(book.available_quantity) || 0), 0);
    const isStudentView = getCurrentLoginRole() === 'student';
    const borrowedBooks = isStudentView
        ? Math.max(Number(localStorage.getItem('currentStudentBorrowedCount') || 0), 0)
        : Math.max(totalBooks - availableBooks, 0);

    totalBooksEl.textContent = String(totalBooks);
    availableCountEl.textContent = String(availableBooks);
    borrowedCountEl.textContent = String(borrowedBooks);

    const availableList = books
        .filter((book) => (Number(book.available_quantity) || 0) > 0)
        .sort((a, b) => (Number(b.available_quantity) || 0) - (Number(a.available_quantity) || 0))
        .slice(0, 6);

    if (availableList.length === 0) {
        availableBooksGrid.innerHTML = '<p class="student-portal-empty">No books are available right now.</p>';
        return;
    }

    availableBooksGrid.innerHTML = availableList.map((book) => `
        <article class="student-book-card">
            <div class="student-book-top">
                <span class="student-book-id">${book.book_id}</span>
                <span class="student-book-badge">${book.available_quantity} available</span>
            </div>
            <h4>${book.title}</h4>
            <p>Author: ${book.author}</p>
        </article>
    `).join('');
}

function updateBooksTable() {
    const tbody = document.getElementById('booksList');
    if(!tbody) return;

    const isStudentView = getCurrentLoginRole() === 'student';
    const normalizedQuery = currentBookSearchQuery.trim().toLowerCase();
    const roleFilteredBooks = isStudentView
        ? books.filter((book) => (Number(book.available_quantity) || 0) > 0)
        : books;
    const booksToRender = normalizedQuery
        ? roleFilteredBooks.filter((book) => String(book.title || '').toLowerCase().includes(normalizedQuery))
        : roleFilteredBooks;

    if (booksToRender.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; color:#6c757d;">No books found for "${currentBookSearchQuery}".</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = booksToRender.map(book => `
        <tr>
            <td>${book.book_id}</td>
            <td>${book.title}</td>
            <td>${book.author}</td>
            <td>${book.total_quantity || 0}</td>
            <td><span class="${(book.available_quantity || 0) > 0 ? 'available' : 'unavailable'}">${book.available_quantity || 0}</span></td>
            <td><button class="btn-danger" data-action="remove-book" data-book-id="${book.book_id}">Remove</button></td>
        </tr>
    `).join('');
}

function searchBooks() {
    const input = document.getElementById('searchTitle');
    currentBookSearchQuery = input ? input.value.trim() : '';
    updateBooksTable();
}

function clearSearch() {
    const input = document.getElementById('searchTitle');
    if (input) input.value = '';
    currentBookSearchQuery = '';
    updateBooksTable();
}

function updateMembersTable() {
    const tbody = document.getElementById('membersList');
    if(!tbody) return;
    tbody.innerHTML = students.map(s => `
        <tr>
            <td>${s.student_id}</td>
            <td>${s.name}</td>
            <td>${s.email}</td>
            <td>${s.course}</td>
            <td>${(s.books_borrowed || []).length}</td>
            <td><button class="btn-danger" data-action="remove-student" data-student-id="${s.student_id}">Remove</button></td>
        </tr>
    `).join('');
}

async function borrowBook(event) {
    event.preventDefault();

    if (getCurrentLoginRole() === 'student') {
        showNotification('❌ Borrow action is disabled in student portal.', 'error');
        return;
    }

    const studentId = document.getElementById('borrowMemberId').value.trim();
    const bookId = document.getElementById('borrowBookId').value.trim();

    if (!studentId || !bookId) {
        showNotification('❌ Please enter Student ID and Book ID', 'error');
        return;
    }

    const result = await fetchAPI('/borrow', 'POST', {
        student_id: studentId,
        book_id: bookId
    });

    if (!result) {
        showNotification('❌ Borrow failed. Check Student ID / Book ID and availability.', 'error');
        return;
    }

    await Promise.all([loadBooks(), loadStudents(), loadDashboard()]);
    viewMemberBooks();
    event.target.reset();
    showTransactionProfileModal('Borrow', studentId, bookId, result || {});
    showNotification('✅ Book borrowed successfully', 'success');
}

async function returnBook(event) {
    event.preventDefault();

    if (getCurrentLoginRole() === 'student') {
        showNotification('❌ Return action is disabled in student portal.', 'error');
        return;
    }

    const studentId = document.getElementById('returnMemberId').value.trim();
    const bookId = document.getElementById('returnBookId').value.trim();

    if (!studentId || !bookId) {
        showNotification('❌ Please enter Student ID and Book ID', 'error');
        return;
    }

    const result = await fetchAPI('/return', 'POST', {
        student_id: studentId,
        book_id: bookId
    });

    if (!result) {
        showNotification('❌ Return failed. Check Student ID / Book ID.', 'error');
        return;
    }

    await Promise.all([loadBooks(), loadStudents(), loadDashboard()]);
    viewMemberBooks();
    event.target.reset();
    showTransactionProfileModal('Return', studentId, bookId, result || {});
    showNotification('✅ Book returned successfully', 'success');
}

async function renewBook(event) {
    event.preventDefault();

    if (getCurrentLoginRole() === 'student') {
        showNotification('❌ Renew action is disabled in student portal.', 'error');
        return;
    }

    const studentId = document.getElementById('renewMemberId').value.trim();
    const bookId = document.getElementById('renewBookId').value.trim();

    if (!studentId || !bookId) {
        showNotification('❌ Please enter Student ID and Book ID', 'error');
        return;
    }

    const result = await fetchAPI('/renew', 'POST', {
        student_id: studentId,
        book_id: bookId
    });

    if (!result) {
        showNotification('❌ Renew failed. Ensure this student has borrowed the book.', 'error');
        return;
    }

    await Promise.all([loadBooks(), loadStudents(), loadDashboard()]);
    viewMemberBooks();
    event.target.reset();
    showTransactionProfileModal('Renew', studentId, bookId, result || {});
    showNotification('✅ Book renewed successfully', 'success');
}

function viewMemberBooks() {
    const searchInput = document.getElementById('memberSearchId');
    const viewContainer = document.getElementById('memberBooksView');
    if (!searchInput || !viewContainer) return;

    if (getCurrentLoginRole() === 'student') {
        viewContainer.innerHTML = '<p>Student details are hidden in student portal.</p>';
        return;
    }

    const studentId = searchInput.value.trim();
    if (!studentId) {
        viewContainer.innerHTML = '<p>Enter a student ID to view their borrowed books.</p>';
        return;
    }

    const student = students.find((item) => item.student_id === studentId);
    if (!student) {
        viewContainer.innerHTML = '<p>❌ Student not found.</p>';
        return;
    }

    const borrowedBookIds = student.books_borrowed || [];
    if (borrowedBookIds.length === 0) {
        viewContainer.innerHTML = `<p>✅ ${student.name} has no borrowed books.</p>`;
        return;
    }

    const items = borrowedBookIds.map((borrowedId) => {
        const borrowedBook = books.find((book) => book.book_id === borrowedId);
        if (!borrowedBook) {
            return `<li>${borrowedId}</li>`;
        }
        return `<li>${borrowedBook.book_id} - ${borrowedBook.title}</li>`;
    }).join('');

    viewContainer.innerHTML = `
        <p><strong>${student.name}</strong> (${student.student_id}) borrowed:</p>
        <ul>${items}</ul>
    `;
}