import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  addDoc,
  serverTimestamp,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import {
  Home,
  ClipboardList,
  CheckCircle,
  PlusCircle,
  ArrowRightLeft,
  TrendingUp,
  History,
  LogOut,
  X,
  MessageSquare,
  Settings,
  Trash2,
  ArrowUp,
  ArrowDown,
  UserPlus,
} from "lucide-react";

// ==========================================
// 🚀 快速設定區
// ==========================================
const SITE_NAME = "甲股勤務支援中心";

const firebaseConfig = {
  apiKey: "AIzaSyAR1GzSueTAQvTTA0LfIYLfuOn9bBtrVDI",
  authDomain: "yilan-99e2b.firebaseapp.com",
  projectId: "yilan-99e2b",
  storageBucket: "yilan-99e2b.firebasestorage.app",
  messagingSenderId: "971422172769",
  appId: "1:971422172769:web:718c4a2aa464d7b10b4c20",
};

const PROJECT_ID = "squad-a-duty-support";

// 預設初始名單 (僅用於第一次同步到雲端)
const INITIAL_ROSTER = {
  A: [
    "蘇原德",
    "俞錦昌",
    "陳凱揚",
    "黃巍",
    "林正倫",
    "陳冠銘",
    "劉家銘",
    "林政彥",
    "游子逵",
    "廖國鈞",
    "陳昭閔",
    "游翼誠",
    "馬國郡",
    "杜岡儒",
    "陳建安",
    "梁辰宇",
    "劉政鍾",
    "洪琮棋",
    "陳俊宏",
    "林宏昌",
    "徐裕凱",
    "楊淵文",
  ],
  B: [
    "蔡睿宇",
    "林振昌",
    "林政毅",
    "陳宏裕",
    "黃世賢",
    "林義益",
    "程冠諺",
    "吳錫隆",
    "劉峻宏",
    "李錫榮",
    "廖於凱",
    "賴勛皓",
    "郭子逢",
    "黃保鳴",
    "阮俊傑",
    "陸明道",
    "陳駿毅",
    "高唯哲",
    "張哲瑋",
    "黃嘉政",
    "鄭佶文",
  ],
  C: [
    "林泰伯",
    "財俊明",
    "賴洪國",
    "林鍵傑",
    "林志昂",
    "陳家宏",
    "江哲",
    "莊立揚",
    "許育維",
    "廖家郁",
    "方子彥",
    "詹文愷",
    "馮國欽",
    "李岳峰",
    "戴煜恩",
    "吳有佳",
    "林仲華",
    "王聖宏",
    "陳慶瑜",
    "林維慶",
    "林嘉祥",
  ],
};

const isWorkingDay = (dateStr, group) => {
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date("2026-02-01T00:00:00");
  const diffDays = Math.round(
    (target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
  );
  const dayIdx = ((diffDays % 6) + 6) % 6;
  if (dayIdx === 1 || dayIdx === 3 || dayIdx === 5) return false;
  if (dayIdx === 0) return group === "A" || group === "B";
  if (dayIdx === 2) return group === "B" || group === "C";
  if (dayIdx === 4) return group === "C" || group === "A";
  return false;
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHIFT_TYPES = {
  FULL: { label: "日夜", cost: 2 },
  DAY: { label: "日班", cost: 1 },
  NIGHT: { label: "夜班", cost: 1 },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeName, setActiveName] = useState(
    () => localStorage.getItem("duty_user") || null
  );
  const [orders, setOrders] = useState([]);
  const [dynamicRoster, setDynamicRoster] = useState([]);
  const [activeTab, setActiveTab] = useState("home");
  const [showLogin, setShowLogin] = useState(false);
  const [showRosterManager, setShowRosterManager] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [modalType, setModalType] = useState("red");
  const [msg, setMsg] = useState(null);
  const [loginGroup, setLoginGroup] = useState("A");

  const [newName, setNewName] = useState("");
  const [postDate, setPostDate] = useState("");
  const [postShift, setPostShift] = useState("FULL");
  const [postReason, setPostReason] = useState("");
  const [postAmount, setPostAmount] = useState("1000");

  const isAdmin = activeName === "馬國郡";

  useEffect(() => {
    document.title = "勤務支援";
    signInAnonymously(auth).catch(console.error);
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubAuth();
  }, []);

  // 監聽動態名單
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "roster"),
      orderBy("sortIndex", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      if (snap.empty) {
        // 如果雲端沒名單，把初始名單倒進去
        Object.entries(INITIAL_ROSTER).forEach(([group, names]) => {
          names.forEach((name, idx) => {
            setDoc(
              doc(
                db,
                "artifacts",
                PROJECT_ID,
                "public",
                "data",
                "roster",
                name
              ),
              {
                name,
                group,
                sortIndex: idx,
              }
            );
          });
        });
      } else {
        setDynamicRoster(snap.docs.map((d) => d.data()));
      }
    });
    return () => unsub();
  }, [user]);

  // 監聽訂單與使用者資料
  useEffect(() => {
    if (!user || !activeName) {
      setShowLogin(true);
      return;
    }
    const unsubOrders = onSnapshot(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
      (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubUser = onSnapshot(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "users", activeName),
      (d) => {
        if (d.exists()) {
          setUserData(d.data());
          setShowLogin(false);
        } else {
          setShowLogin(true);
        }
      }
    );
    return () => {
      unsubOrders();
      unsubUser();
    };
  }, [user, activeName]);

  const showToast = (text, type = "info") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleLogin = async (name, group) => {
    const ref = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      name
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name, group, points: 2, uid: name });
    }
    setActiveName(name);
    localStorage.setItem("duty_user", name);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setActiveName(null);
    localStorage.removeItem("duty_user");
    setShowLogin(true);
  };

  // 名單管理功能
  const addPerson = async () => {
    if (!newName) return;
    const maxIdx = Math.max(
      ...dynamicRoster
        .filter((p) => p.group === loginGroup)
        .map((p) => p.sortIndex),
      -1
    );
    await setDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "roster", newName),
      {
        name: newName,
        group: loginGroup,
        sortIndex: maxIdx + 1,
      }
    );
    setNewName("");
    showToast(`✅ 已新增 ${newName}`);
  };

  const deletePerson = async (name) => {
    if (window.confirm(`確定要刪除 ${name} 嗎？`)) {
      await deleteDoc(
        doc(db, "artifacts", PROJECT_ID, "public", "data", "roster", name)
      );
      showToast(`🗑️ 已刪除 ${name}`);
    }
  };

  const movePerson = async (index, direction) => {
    const groupMembers = dynamicRoster.filter((p) => p.group === loginGroup);
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= groupMembers.length) return;

    const current = groupMembers[index];
    const target = groupMembers[targetIdx];

    await updateDoc(
      doc(
        db,
        "artifacts",
        PROJECT_ID,
        "public",
        "data",
        "roster",
        current.name
      ),
      { sortIndex: target.sortIndex }
    );
    await updateDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "roster", target.name),
      { sortIndex: current.sortIndex }
    );
  };

  // 原始勤務邏輯保持不變...
  const postOrder = async (formData) => {
    const { date, shiftType, type, reason, amount } = formData;
    if (
      orders.some(
        (o) =>
          o.creatorId === activeName &&
          o.date === date &&
          o.type === type &&
          o.status === "open"
      )
    ) {
      showToast("❌ 已發布過相同需求！", "error");
      return;
    }
    if (type === "red" && !isWorkingDay(date, userData.group)) {
      showToast("❌ 您當天原本就是休假！", "error");
      return;
    }
    if (type === "green" && isWorkingDay(date, userData.group)) {
      showToast("❌ 您當天原本就有勤務！", "error");
      return;
    }
    await addDoc(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
      {
        creatorId: activeName,
        creatorName: activeName,
        creatorGroup: userData.group,
        date,
        shiftType,
        type,
        reason,
        amount: amount === "" ? 1000 : Number(amount),
        status: "open",
        createdAt: serverTimestamp(),
      }
    );
    setShowPostModal(false);
    showToast("✅ 發布成功！", "success");
  };

  const handleMatch = async (order) => {
    const cost = SHIFT_TYPES[order.shiftType]?.cost || 2;
    const workerId = order.type === "red" ? activeName : order.creatorId;
    const workerRef = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      workerId
    );
    const workerData = (await getDoc(workerRef)).data();
    if (
      isWorkingDay(
        order.date,
        activeName === workerId ? userData.group : order.creatorGroup
      )
    ) {
      showToast("🚫 勤務配對衝突！", "error");
      return;
    }
    await updateDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id),
      {
        status: "matched",
        workerId: activeName,
        workerName: activeName,
        matchedAt: serverTimestamp(),
      }
    );
    await updateDoc(workerRef, { points: workerData.points - cost });
    showToast("🤝 配對成功！", "success");
    setActiveTab("completed");
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    await deleteDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", id)
    );
    showToast("🗑️ 已移除紀錄");
  };

  const openOrdersMemo = useMemo(
    () =>
      orders
        .filter((o) => o.status === "open")
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [orders]
  );
  const matchedOrdersMemo = useMemo(
    () =>
      orders
        .filter((o) => o.status === "matched")
        .sort(
          (a, b) => (b.matchedAt?.seconds || 0) - (a.matchedAt?.seconds || 0)
        ),
    [orders]
  );

  const renderHome = () => (
    <div className="p-4 sm:p-6 space-y-6 pb-24">
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <p className="opacity-70 text-sm font-medium">
          {userData?.group}組 · {activeName}
        </p>
        <div className="mt-4">
          <p className="text-xs opacity-60 mb-1">本月狀態</p>
          <h2 className="text-xl sm:text-2xl font-black tracking-wide">
            {getPointsStatusText(userData?.points)}
          </h2>
          <p className="text-[10px] opacity-40 mt-1">
            目前點數: {userData?.points ?? 0}
          </p>
        </div>
        <TrendingUp
          size={60}
          className="absolute -right-4 -bottom-2 opacity-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => {
            setModalType("red");
            setPostDate("");
            setPostReason("");
            setShowPostModal(true);
          }}
          className="bg-white p-4 min-h-[80px] rounded-2xl shadow-sm border-2 border-red-50 text-red-700 font-bold flex flex-col items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <PlusCircle size={24} /> <span>我想休假</span>
        </button>
        <button
          onClick={() => {
            setModalType("green");
            setPostDate("");
            setPostReason("");
            setShowPostModal(true);
          }}
          className="bg-white p-4 min-h-[80px] rounded-2xl shadow-sm border-2 border-emerald-50 text-emerald-700 font-bold flex flex-col items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <PlusCircle size={24} /> <span>我想賺錢</span>
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
          <ClipboardList size={20} /> 佈告欄 ({openOrdersMemo.length})
        </h2>
        {openOrdersMemo.map((order) => (
          <div
            key={order.id}
            className="bg-white p-4 rounded-2xl border flex gap-4 shadow-sm relative overflow-hidden"
          >
            <div
              className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                order.type === "red" ? "bg-red-500" : "bg-emerald-500"
              }`}
            />
            <div className="flex-1 pl-2">
              <div className="flex justify-between items-start">
                <div>
                  <p
                    className={`text-xs font-black mb-1 ${
                      order.type === "red" ? "text-red-500" : "text-emerald-600"
                    }`}
                  >
                    {order.type === "red" ? "我想休假" : "我想賺錢"}
                  </p>
                  <p className="font-black text-lg text-slate-800">
                    {new Date(order.date).toLocaleDateString("zh-TW", {
                      month: "short",
                      day: "numeric",
                      weekday: "short",
                    })}
                  </p>
                  {order.reason && (
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-medium bg-slate-50 p-1.5 rounded-lg inline-flex">
                      <MessageSquare size={12} /> {order.reason}
                    </p>
                  )}
                  <p className="text-sm font-medium text-slate-500 mt-2">
                    {SHIFT_TYPES[order.shiftType].label} · {order.creatorName}
                  </p>
                </div>
                {(activeName === order.creatorId || isAdmin) && (
                  <button
                    onClick={() => deleteOrder(order.id)}
                    className="p-2 text-slate-300 hover:text-red-500 active:scale-90"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <button
                onClick={() => handleMatch(order)}
                className={`w-full mt-4 py-3 rounded-xl text-sm font-black transition-all active:scale-95 ${
                  activeName === order.creatorId
                    ? "bg-slate-100 text-slate-400"
                    : "bg-slate-800 text-white shadow-md"
                }`}
                disabled={activeName === order.creatorId}
              >
                {activeName === order.creatorId ? "等待中..." : "幫這個忙"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto relative font-sans overflow-x-hidden">
      <style>{` ::-webkit-scrollbar { display: none; } `}</style>

      {msg && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full text-white text-sm font-bold shadow-lg animate-in fade-in slide-in-from-top-4 ${
            msg.type === "error" ? "bg-red-500" : "bg-emerald-500"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* 登入視窗 */}
      {showLogin && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-[2rem] p-6 space-y-6 shadow-2xl">
            <h1 className="text-2xl font-black text-center text-slate-800">
              登入 {SITE_NAME}
            </h1>
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                    loginGroup === g
                      ? "bg-white shadow-sm text-blue-600"
                      : "text-slate-400"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>
            <div className="max-h-[40vh] overflow-y-auto grid grid-cols-2 gap-3 pr-2">
              {dynamicRoster
                .filter((p) => p.group === loginGroup)
                .map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleLogin(p.name, p.group)}
                    className="p-4 border-2 border-slate-100 rounded-2xl font-black text-slate-700 active:bg-blue-50 active:scale-95 transition-all"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowRosterManager(true)}
                className="w-full py-3 flex items-center justify-center gap-2 text-slate-400 text-sm font-bold border-t pt-4"
              >
                <Settings size={16} /> ⚙️ 管理名單
              </button>
            )}
          </div>
        </div>
      )}

      {/* 名單管理視窗 */}
      {showRosterManager && (
        <div className="fixed inset-0 z-[70] bg-white flex flex-col">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h2 className="font-black text-lg">⚙️ 名單管理 - {loginGroup}組</h2>
            <button
              onClick={() => setShowRosterManager(false)}
              className="p-2 bg-slate-200 rounded-full"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4 bg-white space-y-4">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="輸入新組員姓名"
                className="flex-1 p-3 bg-slate-100 rounded-xl font-bold"
              />
              <button
                onClick={addPerson}
                className="p-3 bg-blue-600 text-white rounded-xl active:scale-95"
              >
                <UserPlus size={24} />
              </button>
            </div>
            <div className="flex gap-2">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-2 rounded-lg font-bold ${
                    loginGroup === g
                      ? "bg-slate-800 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {dynamicRoster
              .filter((p) => p.group === loginGroup)
              .map((p, idx, arr) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border"
                >
                  <span className="font-black text-slate-700 flex-1">
                    {p.name}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => movePerson(idx, "up")}
                      disabled={idx === 0}
                      className="p-2 text-slate-400 disabled:opacity-20"
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      onClick={() => movePerson(idx, "down")}
                      disabled={idx === arr.length - 1}
                      className="p-2 text-slate-400 disabled:opacity-20"
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      onClick={() => deletePerson(p.name)}
                      className="p-2 text-red-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 發布彈窗保持不變... */}
      {showPostModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-[2rem] p-6 pb-12 animate-in slide-in-from-bottom-full shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-slate-800">
              {modalType === "red" ? "🔴 發布休假單" : "🟢 發布加班單"}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                postOrder({
                  date: postDate,
                  shiftType: postShift,
                  type: modalType,
                  reason: postReason,
                  amount: postAmount,
                });
              }}
              className="space-y-5"
            >
              <input
                required
                type="date"
                value={postDate}
                onChange={(e) => setPostDate(e.target.value)}
                className="w-full p-4 bg-slate-100 rounded-2xl font-medium"
              />
              <select
                value={postShift}
                onChange={(e) => setPostShift(e.target.value)}
                className="w-full p-4 bg-slate-100 rounded-2xl font-medium"
              >
                <option value="FULL">日夜</option>
                <option value="DAY">日班</option>
                <option value="NIGHT">夜班</option>
              </select>
              <input
                type="number"
                placeholder="金額 (預設1000)"
                value={postAmount}
                onChange={(e) => setPostAmount(e.target.value)}
                className="w-full p-4 bg-slate-100 rounded-2xl font-medium"
              />
              <input
                type="text"
                placeholder="備註原因 (限10字)"
                maxLength="10"
                value={postReason}
                onChange={(e) => setPostReason(e.target.value)}
                className="w-full p-4 bg-slate-100 rounded-2xl font-medium"
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 p-4 font-black text-slate-500 bg-slate-100 rounded-2xl"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`flex-1 p-4 rounded-2xl font-black text-white ${
                    modalType === "red"
                      ? "bg-red-500 shadow-red-500/30"
                      : "bg-emerald-500 shadow-emerald-500/30"
                  }`}
                >
                  確認發布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="sticky top-0 bg-white/90 backdrop-blur-md p-4 flex justify-between items-center z-40 border-b">
        <h1 className="font-black text-slate-800 tracking-wide">{SITE_NAME}</h1>
        <button
          onClick={handleLogout}
          className="p-2 bg-slate-100 text-slate-600 rounded-full active:scale-90 transition-all"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="relative">
        {activeTab === "home" ? (
          renderHome()
        ) : (
          <div className="p-4 sm:p-6 space-y-4 pb-24">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
              <History size={20} /> 換班完成區
            </h2>
            {matchedOrdersMemo.map((order) => (
              <div
                key={order.id}
                className="bg-white p-5 rounded-2xl border shadow-sm relative"
              >
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-black">
                    MATCHED
                  </span>
                  {(activeName === order.creatorId || isAdmin) && (
                    <button
                      onClick={() => deleteOrder(order.id)}
                      className="p-2 -mr-2 text-slate-300 hover:text-red-500 active:scale-90"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-around text-center bg-slate-50 p-3 rounded-xl">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 font-bold mb-1">
                      休假
                    </p>
                    <p className="font-black text-slate-700">
                      {order.type === "red"
                        ? order.creatorName
                        : order.workerName}
                    </p>
                  </div>
                  <ArrowRightLeft className="text-slate-300" size={24} />
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 font-bold mb-1">
                      加班
                    </p>
                    <p className="font-black text-blue-600">
                      {order.type === "red"
                        ? order.workerName
                        : order.creatorName}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t text-xs text-slate-500 flex justify-between items-center font-medium">
                  <span>
                    {order.date} · {SHIFT_TYPES[order.shiftType].label}
                  </span>
                  <span className="font-black text-slate-700 text-sm">
                    💰 {order.amount || 1000}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white/95 backdrop-blur-md border-t pt-2 pb-[90px] flex justify-around items-center z-40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex-1 py-2 flex flex-col items-center transition-all active:scale-95 ${
            activeTab === "home" ? "text-blue-600" : "text-slate-400"
          }`}
        >
          <Home size={24} strokeWidth={activeTab === "home" ? 2.5 : 2} />
          <span className="text-[10px] font-black mt-1">佈告欄</span>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 py-2 flex flex-col items-center transition-all active:scale-95 ${
            activeTab === "completed" ? "text-blue-600" : "text-slate-400"
          }`}
        >
          <CheckCircle
            size={24}
            strokeWidth={activeTab === "completed" ? 2.5 : 2}
          />
          <span className="text-[10px] font-black mt-1">完成區</span>
        </button>
      </nav>
    </div>
  );
}
