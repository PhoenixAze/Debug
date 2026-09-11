"use strict";

const BASE_API_URL = "https://gradient-backend-fam5.onrender.com/api/v1/debug";

// TƏHLÜKƏSİZLİK: Açarı koddan sildik! İndi onu brauzer yaddaşından alacağıq.
let DEBUG_SECRET_KEY = localStorage.getItem('gradient_debug_key');

// Açar yoxdursa və ya səhvdirsə istifadəçidən soruşan funksiya
function getSecretKey() {
    if (!DEBUG_SECRET_KEY) {
        DEBUG_SECRET_KEY = prompt("Sistemə giriş üçün Debug Açarını daxil edin:");
        if (DEBUG_SECRET_KEY) {
            localStorage.setItem('gradient_debug_key', DEBUG_SECRET_KEY);
        } else {
            alert("Açar daxil edilmədi. Səhifə işləməyəcək.");
        }
    }
    return DEBUG_SECRET_KEY;
}

// Əgər açar səhv olarsa, yaddaşdan silib yenidən istəmək üçün funksiya
function handleAuthError() {
    localStorage.removeItem('gradient_debug_key');
    DEBUG_SECRET_KEY = null;
    alert("Gizli açar yanlışdır! Səhifə yenilənir...");
    location.reload(); // Səhifəni yeniləyir ki, yenidən şifrə istəsin
}

document.addEventListener("DOMContentLoaded", () => {
    
    // DOM Elementləri (Əvvəlki kimi qalır)
    const btnRefresh = document.getElementById('btn-refresh');
    const toggleAutoRefresh = document.getElementById('toggle-autorefresh');
    const toast = document.getElementById('toast');
    
    const badgeBackend = document.getElementById('badge-backend');
    const valBackend = document.getElementById('val-backend');
    const errBackend = document.getElementById('err-backend');
    
    const badgeDb = document.getElementById('badge-db');
    const valDb = document.getElementById('val-db');
    const errDb = document.getElementById('err-db');

    const metrics = {
        totalUsers: document.getElementById('m-total-users'),
        students: document.getElementById('m-students'),
        tutors: document.getElementById('m-tutors'),
        admins: document.getElementById('m-admins'),
        exams: document.getElementById('m-exams'),
        questions: document.getElementById('m-questions')
    };

    const revenueDisplay = document.getElementById('revenue-display');
    const revenueInput = document.getElementById('revenue-input');
    const btnSaveRevenue = document.getElementById('btn-save-revenue');

    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const inputBalIdentifier = document.getElementById('bal-identifier');
    const btnCheckUser = document.getElementById('btn-check-user');
    
    const foundUserName = document.getElementById('found-user-name');
    const foundUserBalance = document.getElementById('found-user-balance');
    const inputBalAmount = document.getElementById('bal-amount');
    const btnUpdateBalance = document.getElementById('btn-update-balance');
    const btnCancelBalance = document.getElementById('btn-cancel-balance');

    let autoRefreshInterval = null;
    let currentVerifiedIdentifier = null;

    const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };

    const formatNumber = (num) => new Intl.NumberFormat('az-AZ').format(num);
    const resetMetrics = () => Object.values(metrics).forEach(el => el.textContent = "-");

    const setStatus = (badgeEl, valEl, errEl, status, message, errorMsg = null) => {
        badgeEl.className = `status-badge ${status}`;
        valEl.textContent = message;
        if (errorMsg) {
            errEl.textContent = errorMsg;
            errEl.style.display = "block";
        } else {
            errEl.style.display = "none";
        }
    };

    const loadRevenue = () => {
        const savedRevenue = localStorage.getItem('debug_revenue') || "0.00";
        revenueDisplay.textContent = `${parseFloat(savedRevenue).toFixed(2)} ₼`;
    };

    btnSaveRevenue.addEventListener('click', () => {
        const val = parseFloat(revenueInput.value);
        if (!isNaN(val)) {
            localStorage.setItem('debug_revenue', val.toString());
            loadRevenue();
            revenueInput.value = "";
            showToast("Maliyyə məlumatı yadda saxlanıldı!");
        } else {
            showToast("Zəhmət olmasa düzgün məbləğ daxil edin.");
        }
    });

    // Mərhələ 1: İstifadəçini Yoxla
    btnCheckUser.addEventListener('click', async () => {
        const identifier = inputBalIdentifier.value.trim();
        if (!identifier) {
            showToast("Zəhmət olmasa E-poçt və ya Nömrə daxil edin.");
            return;
        }

        const key = getSecretKey();
        if (!key) return;

        btnCheckUser.textContent = "Yoxlanılır...";
        btnCheckUser.style.pointerEvents = "none";

        try {
            const response = await fetch(`${BASE_API_URL}/check-user`, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "X-Debug-Key": key
                },
                body: JSON.stringify({ identifier: identifier })
            });

            if (response.status === 403) return handleAuthError();

            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Xəta baş verdi");

            currentVerifiedIdentifier = identifier;
            foundUserName.textContent = `${data.first_name} ${data.last_name}`;
            foundUserBalance.textContent = parseFloat(data.balance).toFixed(2);
            
            step1.classList.add('hidden');
            step2.classList.remove('hidden');
            showToast("İstifadəçi tapıldı!");

        } catch (error) {
            showToast(`Xəta: ${error.message}`);
        } finally {
            btnCheckUser.textContent = "İstifadəçini Yoxla";
            btnCheckUser.style.pointerEvents = "auto";
        }
    });

    btnCancelBalance.addEventListener('click', () => {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
        inputBalIdentifier.value = "";
        inputBalAmount.value = "";
        currentVerifiedIdentifier = null;
    });

    // Mərhələ 2: Təsdiqlə və Yenilə
    btnUpdateBalance.addEventListener('click', async () => {
        const amount = parseFloat(inputBalAmount.value);
        if (isNaN(amount) || amount < 0) {
            showToast("Zəhmət olmasa düzgün məbləğ daxil edin.");
            return;
        }

        const key = getSecretKey();
        if (!key) return;

        btnUpdateBalance.textContent = "Yenilənir...";
        btnUpdateBalance.style.pointerEvents = "none";

        try {
            const response = await fetch(`${BASE_API_URL}/update-balance`, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "X-Debug-Key": key
                },
                body: JSON.stringify({
                    identifier: currentVerifiedIdentifier,
                    new_balance: amount
                })
            });

            if (response.status === 403) return handleAuthError();

            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || "Xəta baş verdi");

            showToast(data.message);
            
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            inputBalIdentifier.value = "";
            inputBalAmount.value = "";
            currentVerifiedIdentifier = null;

        } catch (error) {
            showToast(`Xəta: ${error.message}`);
        } finally {
            btnUpdateBalance.textContent = "Təsdiqlə və Yenilə";
            btnUpdateBalance.style.pointerEvents = "auto";
        }
    });

    // Backend Vəziyyətini Yoxla
    const fetchStats = async () => {
        const key = getSecretKey();
        if (!key) return;

        btnRefresh.style.opacity = "0.5";
        btnRefresh.style.pointerEvents = "none";
        
        try {
            const response = await fetch(`${BASE_API_URL}/stats`, {
                method: 'GET',
                headers: {
                    "X-Debug-Key": key,
                    "Accept": "application/json"
                }
            });
            
            if (response.status === 403) return handleAuthError();
            if (!response.ok) throw new Error(`HTTP Xəta: ${response.status}`);
            
            const data = await response.json();

            if (data.status === "online") {
                setStatus(badgeBackend, valBackend, errBackend, "online", "Online");
            } else {
                setStatus(badgeBackend, valBackend, errBackend, "offline", "Xəta", data.error_detail || "Bilinməyən xəta");
            }

            if (data.database === "connected") {
                setStatus(badgeDb, valDb, errDb, "online", "Qoşulub");
            } else {
                setStatus(badgeDb, valDb, errDb, "offline", "Bağlantı Yoxdur", data.error_detail || "DB xətası");
            }

            if (data.metrics && data.metrics.users && data.metrics.exams) {
                metrics.totalUsers.textContent = formatNumber(data.metrics.users.total);
                metrics.students.textContent = formatNumber(data.metrics.users.students);
                metrics.tutors.textContent = formatNumber(data.metrics.users.tutors);
                metrics.admins.textContent = formatNumber(data.metrics.users.admins);
                metrics.exams.textContent = formatNumber(data.metrics.exams.total);
                metrics.questions.textContent = formatNumber(data.metrics.exams.total_questions);
            } else {
                resetMetrics();
            }

        } catch (error) {
            setStatus(badgeBackend, valBackend, errBackend, "offline", "Offline", error.message);
            setStatus(badgeDb, valDb, errDb, "offline", "Bilinmir");
            resetMetrics();
        } finally {
            btnRefresh.style.opacity = "1";
            btnRefresh.style.pointerEvents = "auto";
        }
    };
    
    toggleAutoRefresh.addEventListener('change', (e) => {
        if (e.target.checked) {
            showToast("Avto-yenilənmə aktiv edildi (30 saniyə)");
            autoRefreshInterval = setInterval(fetchStats, 30000);
        } else {
            showToast("Avto-yenilənmə deaktiv edildi");
            clearInterval(autoRefreshInterval);
        }
    });

    btnRefresh.addEventListener('click', () => {
        fetchStats();
        showToast("Məlumatlar yenilənir...");
    });

    // İlkin yüklənmə
    loadRevenue();
    // Səhifə açılanda dərhal açarı yoxlayıb məlumatları çəkirik
    if (getSecretKey()) {
        fetchStats();
    }
});