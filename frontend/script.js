const API = "http://localhost:5000";

let queueData = [];
let servedData = [];

async function fetchQueue() {
    try {
        const [queueRes, servedRes] = await Promise.all([
            fetch(API + "/queue"),
            fetch(API + "/served")
        ]);
        
        if (!queueRes.ok || !servedRes.ok) throw new Error("Failed to fetch");
        
        const qData = await queueRes.json();
        const sData = await servedRes.json();
        
        // Only re-render if data has changed to avoid animation flickering
        if (JSON.stringify(qData) !== JSON.stringify(queueData)) {
            queueData = qData;
            renderQueue();
        }
        
        if (JSON.stringify(sData) !== JSON.stringify(servedData)) {
            servedData = sData;
            renderServed();
        }
    } catch (err) {
        console.error("Queue fetch error:", err);
    }
}

function renderQueue() {
    const list = document.getElementById("queueList");
    const countBadge = document.getElementById("waitingCount");
    
    countBadge.innerText = queueData.length;
    list.innerHTML = "";

    if (queueData.length === 0) {
        list.innerHTML = '<div class="empty-state">No customers waiting.</div>';
        return;
    }

    queueData.forEach(c => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="ticket-info">
                <span class="ticket-id">#${c.id}</span>
                <span class="ticket-name">${escapeHTML(c.name)}</span>
            </div>
            <span class="ticket-service">${escapeHTML(c.service)}</span>
        `;
        list.appendChild(li);
    });
}

function renderServed() {
    const list = document.getElementById("historyList");
    const countBadge = document.getElementById("servedCount");
    
    countBadge.innerText = servedData.length;
    list.innerHTML = "";

    if (servedData.length === 0) {
        list.innerHTML = '<div class="empty-state">No past customers.</div>';
        return;
    }

    servedData.forEach(c => {
        const li = document.createElement("li");
        li.classList.add("served-ticket");
        li.innerHTML = `
            <div class="ticket-info">
                <span class="ticket-id">#${c.id}</span>
                <span class="ticket-name">${escapeHTML(c.name)}</span>
            </div>
            <span class="ticket-service">${escapeHTML(c.service)}</span>
        `;
        list.appendChild(li);
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

async function addCustomer() {
    const nameInput = document.getElementById("name");
    const serviceInput = document.getElementById("service");
    
    if (!nameInput.value.trim()) {
        nameInput.focus();
        return;
    }

    const name = nameInput.value.trim();
    const service = serviceInput.value;

    try {
        await fetch(API + "/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, service })
        });
        nameInput.value = "";
        fetchQueue();
    } catch (err) {
        console.error("Add customer error:", err);
    }
}

async function serveCustomer() {
    if (queueData.length === 0) return;
    try {
        await fetch(API + "/serve", { method: "POST" });
        fetchQueue();
    } catch (err) {
        console.error("Serve error:", err);
    }
}

async function resetDatabase() {
    if (!confirm("Are you sure you want to reset the database? This will clear all waiting and served customers.")) return;
    try {
        await fetch(API + "/reset", { method: "POST" });
        fetchQueue();
    } catch (err) {
        console.error("Reset error:", err);
    }
}

// Initial fetch and start polling every 3 seconds
fetchQueue();
setInterval(fetchQueue, 3000);

// Enter key support for input
document.getElementById("name").addEventListener("keypress", function(e) {
    if (e.key === "Enter") addCustomer();
});