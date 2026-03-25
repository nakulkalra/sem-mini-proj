const API = "http://localhost:5000";

async function addCustomer() {
    const name = document.getElementById("name").value;
    const service = document.getElementById("service").value;

    await fetch(API + "/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, service })
    });

    loadQueue();
}

async function serveCustomer() {
    await fetch(API + "/serve", { method: "POST" });
    loadQueue();
}

async function loadQueue() {
    const res = await fetch(API + "/queue");
    const data = await res.json();

    const list = document.getElementById("queueList");
    list.innerHTML = "";

    data.forEach(c => {
        const li = document.createElement("li");
        li.innerText = `${c.id} - ${c.name} (${c.service})`;
        list.appendChild(li);
    });
}

loadQueue();