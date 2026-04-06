    /**
     * Express Server for Library Management System - Optimized Startup
     */

    const express = require('express');
    const cors = require('cors');
    const path = require('path');
    const { MongoClient } = require('mongodb');
    const { exec } = require('child_process');
    require('dotenv').config();

    const app = express();
    const PORT = 3000;

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '.')));

    // MongoDB Connection
    const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
    const DB_NAME = process.env.DB_NAME || 'library_system';
    let db = null;
    let client = null;

    async function connectDB() {
        try {
            client = new MongoClient(MONGO_URL, { 
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 5000 
            });
            await client.connect();
            db = client.db(DB_NAME);
            console.log('✅ Connected to MongoDB');
            await initializeCollections();
        } catch (error) {
            console.error(`❌ MongoDB connection failed (${error.message}). Running in Demo Mode.`);
        }
    }

    async function initializeCollections() {
        try {
            const collections = await db.listCollections().toArray();
            const names = collections.map(c => c.name);
            if (!names.includes('users')) await db.createCollection('users');
            if (!names.includes('books')) await db.createCollection('books');
            if (!names.includes('students')) await db.createCollection('students');
            if (!names.includes('transactions')) await db.createCollection('transactions');
        } catch (e) { console.log("Init error:", e.message); }
    }

    // ==================== API ENDPOINTS ====================
    // AUTHENTICATION ENDPOINTS
    app.post('/api/auth/signup', async (req, res) => {
        try {
            const { user_type, id, name, email, password, course } = req.body;

            if (!user_type || !id || !name || !email || !password) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            if (!db) {
                return res.json({ success: true, message: 'Demo mode - account created locally' });
            }

            const existingUser = await db.collection('users').findOne({ id });
            if (existingUser) {
                return res.status(400).json({ success: false, error: 'ID already registered' });
            }

            const userData = {
                user_type, id, name, email, password,
                course: user_type === 'student' ? course : null,
                created_at: new Date(), status: 'active'
            };

            await db.collection('users').insertOne(userData);
            res.json({ success: true, message: 'Account created successfully' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/auth/login', async (req, res) => {
        try {
            const { id, password } = req.body;

            const username = String(id || '').trim();
            const rawPassword = String(password || '').trim();

            if (!username || !rawPassword) {
                return res.status(400).json({ success: false, error: 'Username and password are required' });
            }

            if (!db) {
                const demoStudent = getDemoStudents().find((student) =>
                    String(student.name || '').trim().toLowerCase() === username.toLowerCase() &&
                    String(student.student_id || '').trim() === rawPassword
                );

                if (demoStudent) {
                    return res.json({
                        success: true,
                        user_type: 'student',
                        user_id: demoStudent.student_id,
                        message: `Welcome ${demoStudent.name}!`
                    });
                }

                return res.json({ success: true, user_type: 'admin', message: 'Logged in (demo mode)' });
            }

            const adminUser = await db.collection('users').findOne({
                id: username,
                password: rawPassword,
                user_type: 'admin'
            });

            if (adminUser) {
                return res.json({ success: true, user_type: 'admin', user_id: adminUser.id, message: `Welcome ${adminUser.name}!` });
            }

            const escapedName = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const studentUser = await db.collection('students').findOne({
                student_id: rawPassword,
                name: { $regex: `^${escapedName}$`, $options: 'i' }
            });

            if (studentUser) {
                return res.json({
                    success: true,
                    user_type: 'student',
                    user_id: studentUser.student_id,
                    message: `Welcome ${studentUser.name}!`
                });
            }

            res.status(401).json({ success: false, error: 'Invalid credentials. Students must use Name as username and Student ID as password.' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    // STUDENT ENDPOINTS
    app.get('/api/students', async (req, res) => {
        try {
            if (!db) {
                return res.json({ success: true, data: getDemoStudents() });
            }
            const students = await db.collection('students').find({}).toArray();
            res.json({ success: true, data: students });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/students', async (req, res) => {
        try {
            const { student_id, name, email, course } = req.body;
            
            if (!student_id || !name || !email || !course) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }
            
            if (!db) {
                return res.json({ success: true, data: { student_id, name, email, course } });
            }
            
            const existingStudent = await db.collection('students').findOne({ student_id });
            if (existingStudent) {
                return res.status(400).json({ success: false, error: 'Student ID already exists' });
            }
            
            const studentData = {
                student_id, name, email, course,
                books_borrowed: [], status: 'Out',
                last_seen: null, enrollment_date: new Date()
            };
            
            const result = await db.collection('students').insertOne(studentData);
            res.json({ success: true, data: { ...studentData, _id: result.insertedId } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/students/:student_id', async (req, res) => {
        try {
            if (!db) {
                return res.json({ success: true, message: 'Demo mode - not persisting' });
            }
            
            const result = await db.collection('students').deleteOne({ 
                student_id: req.params.student_id 
            });
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // BOOK ENDPOINTS
    app.get('/api/books', async (req, res) => {
        try {
            if (!db) {
                return res.json({ success: true, data: getDemoBooks() });
            }
            const books = await db.collection('books').find({}).toArray();
            res.json({ success: true, data: books });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/books', async (req, res) => {
        try {
            const { book_id, title, author, quantity } = req.body;
            
            if (!book_id || !title || !author || !quantity) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }
            
            if (!db) {
                return res.json({ success: true, data: { book_id, title, author, quantity } });
            }
            
            const existingBook = await db.collection('books').findOne({ book_id });
            if (existingBook) {
                return res.status(400).json({ success: false, error: 'Book ID already exists' });
            }
            
            const bookData = {
                book_id, title, author,
                total_quantity: quantity,
                available_quantity: quantity,
                borrowed_by: [], created_date: new Date()
            };
            
            const result = await db.collection('books').insertOne(bookData);
            res.json({ success: true, data: { ...bookData, _id: result.insertedId } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/books/:book_id', async (req, res) => {
        try {
            if (!db) {
                return res.json({ success: true, message: 'Demo mode - not persisting' });
            }
            
            const result = await db.collection('books').deleteOne({ 
                book_id: req.params.book_id 
            });
            res.json({ success: true, data: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // TRANSACTION ENDPOINTS
    app.post('/api/borrow', async (req, res) => {
        try {
            const { student_id, book_id } = req.body;
            
            if (!db) {
                return res.json({ success: true, message: 'Demo mode - not persisting' });
            }
            
            const book = await db.collection('books').findOne({ book_id });
            if (!book || book.available_quantity <= 0) {
                return res.status(400).json({ success: false, error: 'Book not available' });
            }
            
            await db.collection('books').updateOne(
                { book_id },
                { $inc: { available_quantity: -1 }, $push: { borrowed_by: { student_id, borrow_date: new Date() } } }
            );
            
            await db.collection('students').updateOne(
                { student_id },
                { $push: { books_borrowed: book_id } }
            );
            
            await db.collection('transactions').insertOne({
                student_id, book_id, action: 'borrow',
                date: new Date(),
                due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            });
            
            res.json({ success: true, message: 'Book borrowed successfully' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/return', async (req, res) => {
        try {
            const { student_id, book_id } = req.body;
            
            if (!db) {
                return res.json({ success: true, message: 'Demo mode - not persisting' });
            }
            
            await db.collection('books').updateOne(
                { book_id },
                { $inc: { available_quantity: 1 }, $pull: { borrowed_by: { student_id } } }
            );
            
            await db.collection('students').updateOne(
                { student_id },
                { $pull: { books_borrowed: book_id } }
            );
            
            await db.collection('transactions').insertOne({
                student_id, book_id, action: 'return', date: new Date()
            });
            
            res.json({ success: true, message: 'Book returned successfully' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/renew', async (req, res) => {
        try {
            const { student_id, book_id } = req.body;

            if (!student_id || !book_id) {
                return res.status(400).json({ success: false, error: 'Missing student_id or book_id' });
            }

            if (!db) {
                return res.json({ success: true, message: 'Demo mode - renewal recorded' });
            }

            const student = await db.collection('students').findOne({ student_id });
            if (!student) {
                return res.status(404).json({ success: false, error: 'Student not found' });
            }

            if (!(student.books_borrowed || []).includes(book_id)) {
                return res.status(400).json({ success: false, error: 'This student has not borrowed this book' });
            }

            const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

            await db.collection('books').updateOne(
                { book_id, 'borrowed_by.student_id': student_id },
                { $set: { 'borrowed_by.$.renew_date': new Date(), 'borrowed_by.$.due_date': dueDate } }
            );

            await db.collection('transactions').insertOne({
                student_id,
                book_id,
                action: 'renew',
                date: new Date(),
                due_date: dueDate
            });

            res.json({ success: true, message: 'Book renewed successfully', due_date: dueDate });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/transactions/:student_id', async (req, res) => {
        try {
            const studentId = req.params.student_id;
            if (!studentId) {
                return res.status(400).json({ success: false, error: 'Missing student_id' });
            }

            if (!db) {
                return res.json({ success: true, data: [] });
            }

            const transactions = await db.collection('transactions')
                .find({ student_id: studentId })
                .sort({ date: -1 })
                .limit(100)
                .toArray();

            if (transactions.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const bookIds = [...new Set(transactions.map((item) => item.book_id).filter(Boolean))];
            const books = await db.collection('books')
                .find({ book_id: { $in: bookIds } })
                .project({ _id: 0, book_id: 1, title: 1 })
                .toArray();

            const titleByBookId = Object.fromEntries(books.map((book) => [book.book_id, book.title]));

            const data = transactions.map((item) => ({
                student_id: item.student_id,
                book_id: item.book_id,
                action: item.action,
                date: item.date,
                due_date: item.due_date || null,
                book_title: titleByBookId[item.book_id] || ''
            }));

            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DASHBOARD ENDPOINTS
    app.get('/api/dashboard', async (req, res) => {
        try {
            if (!db) {
                return res.json({ 
                    success: true, 
                    data: {
                        total_books: 15,
                        available_books: 10,
                        total_students: 8,
                        books_borrowed: 5
                    }
                });
            }
            
            const totalBooks = await db.collection('books').countDocuments();
            const totalStudents = await db.collection('students').countDocuments();
            
            const books = await db.collection('books').find({}).toArray();
            const availableBooks = books.reduce((sum, b) => sum + b.available_quantity, 0);
            const booksBorrowed = books.reduce((sum, b) => sum + (b.total_quantity - b.available_quantity), 0);
            
            res.json({ 
                success: true, 
                data: {
                    total_books: totalBooks,
                    available_books: availableBooks,
                    total_students: totalStudents,
                    books_borrowed: booksBorrowed
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/health', (req, res) => {
        res.json({ 
            status: 'ok',
            mongodb: db ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString()
        });
    });

    app.get('/api/mongodb-status', async (req, res) => {
        try {
            if (!db) {
                return res.json({
                    success: false,
                    status: 'disconnected',
                    error: 'MongoDB not connected'
                });
            }

            const collections = await db.listCollections().toArray();
            const studentsCount = await db.collection('students').countDocuments();
            const booksCount = await db.collection('books').countDocuments();

            res.json({
                success: true,
                status: 'connected',
                database: DB_NAME,
                collections: {
                    total: collections.length,
                    students_count: studentsCount,
                    books_count: booksCount
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                status: 'error',
                error: error.message
            });
        }
    });

    // DEMO DATA FUNCTIONS
    function getDemoBooks() {
        return [
            { book_id: 'B001', title: 'Introduction to Algorithms', author: 'Thomas Cormen', total_quantity: 3, available_quantity: 2, borrowed_by: [] },
            { book_id: 'B002', title: 'Clean Code', author: 'Robert Martin', total_quantity: 2, available_quantity: 1, borrowed_by: [] },
            { book_id: 'B003', title: 'Design Patterns', author: 'Gang of Four', total_quantity: 2, available_quantity: 2, borrowed_by: [] },
            { book_id: 'B004', title: 'JavaScript: The Good Parts', author: 'Douglas Crockford', total_quantity: 3, available_quantity: 3, borrowed_by: [] },
            { book_id: 'B005', title: 'The Pragmatic Programmer', author: 'Hunt & Thomas', total_quantity: 2, available_quantity: 1, borrowed_by: [] }
        ];
    }

    function getDemoStudents() {
        return [
            { student_id: 'S001', name: 'John Smith', email: 'john@college.edu', course: 'B.Tech CSE', books_borrowed: [], enrollment_date: new Date() },
            { student_id: 'S002', name: 'Sarah Johnson', email: 'sarah@college.edu', course: 'B.Tech CSE', books_borrowed: [], enrollment_date: new Date() },
            { student_id: 'S003', name: 'Mike Davis', email: 'mike@college.edu', course: 'B.Tech ECE', books_borrowed: [], enrollment_date: new Date() }
        ];
    }

    // ==================== IMPROVED SERVER STARTUP ====================

    function killExistingProcess() {
        return new Promise((resolve) => {
            console.log('🔍 Checking Port 3000...');
            // Windows command to find and kill the process on port 3000
            const cmd = `for /f "tokens=5" %a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %a`;
            
            exec(cmd, (error) => {
                if (error) {
                    console.log('✅ Port 3000 is already clear.');
                } else {
                    console.log('🔧 Old server process terminated.');
                }
                // Essential: Wait 2 seconds for Windows to actually release the port
                setTimeout(resolve, 2000); 
            });
        });
    }

    async function startServer() {
        // 1. Force kill any old process first
        await killExistingProcess();

        // 2. Connect to Database
        await connectDB();

        // 3. Start Listening
        const server = app.listen(PORT, () => {
            console.log(`🚀 SUCCESS: Server running at http://localhost:${PORT}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error('❌ Port 3000 is still locked. Please close your other terminal windows.');
                process.exit(1);
            }
        });
    }

    // Handle exit
    process.on('SIGINT', async () => {
        if (client) await client.close();
        process.exit(0);
    });

    startServer();