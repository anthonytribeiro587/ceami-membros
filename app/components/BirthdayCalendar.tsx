'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cake, ChevronLeft, ChevronRight, X } from 'lucide-react';
import styles from './BirthdayCalendar.module.css';

type BirthdayMember = {
  id: string;
  name: string;
  phone: string;
  birthDate: string;
  ministry: string;
  initials: string;
};

type Props = {
  members: BirthdayMember[];
  onOpenMember: (id: string) => void;
};

type CalendarCell = {
  date: Date;
  day: number;
  currentMonth: boolean;
  isToday: boolean;
  members: BirthdayMember[];
};

const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function dateKey(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function ageInYear(birthDate: string, year: number) {
  const birthYear = Number(birthDate.slice(0, 4));
  if (!birthYear || year < birthYear) return null;
  return year - birthYear;
}

function formatSelectedDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function BirthdayCalendar({ members, onOpenMember }: Props) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<CalendarCell | null>(null);

  const birthdaysByDay = useMemo(() => {
    const map = new Map<string, BirthdayMember[]>();

    for (const member of members) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(member.birthDate)) continue;
      const key = member.birthDate.slice(5);
      const current = map.get(key) || [];
      current.push(member);
      map.set(key, current);
    }

    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return map;
  }, [members]);

  const cells = useMemo<CalendarCell[]>(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const gridStart = new Date(year, month, 1 - firstWeekDay);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return {
        date,
        day: date.getDate(),
        currentMonth: date.getMonth() === month,
        isToday: sameDay(date, today),
        members: birthdaysByDay.get(dateKey(date)) || [],
      };
    });
  }, [birthdaysByDay, cursor, today]);

  const currentMonthBirthdays = useMemo(
    () => members.filter((member) => Number(member.birthDate.slice(5, 7)) === cursor.getMonth() + 1),
    [cursor, members],
  );

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeWithEscape = (event: KeyboardEvent) => event.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, [selected]);

  function moveMonth(amount: number) {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setSelected(null);
  }

  function goToday() {
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelected(null);
  }

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor);

  return (
    <section className={styles.calendarPage}>
      <div className={styles.calendarHeader}>
        <div>
          <span className={styles.eyebrow}>CALENDÁRIO DE ANIVERSÁRIOS</span>
          <h2>{monthLabel}</h2>
          <p>{currentMonthBirthdays.length} {currentMonthBirthdays.length === 1 ? 'aniversariante neste mês' : 'aniversariantes neste mês'}</p>
        </div>
        <div className={styles.calendarActions}>
          <button type="button" className={styles.todayButton} onClick={goToday}>Hoje</button>
          <button type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button>
          <button type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button>
        </div>
      </div>

      <div className={styles.calendarShell}>
        <div className={styles.weekHeader}>{WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className={styles.calendarGrid}>
          {cells.map((cell) => {
            const visibleMembers = cell.members.slice(0, 2);
            const hiddenCount = Math.max(0, cell.members.length - visibleMembers.length);
            return (
              <button
                type="button"
                key={cell.date.toISOString()}
                className={`${styles.dayCell} ${!cell.currentMonth ? styles.outsideMonth : ''} ${cell.isToday ? styles.today : ''} ${cell.members.length ? styles.hasBirthday : ''}`}
                onClick={() => setSelected(cell)}
              >
                <span className={styles.dayNumber}>{cell.day}</span>
                <div className={styles.names}>
                  {visibleMembers.map((member) => <span key={member.id} title={member.name}><Cake size={11} />{firstName(member.name)}</span>)}
                  {hiddenCount > 0 && <strong>+{hiddenCount}</strong>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => setSelected(null)}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="birthday-day-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>ANIVERSÁRIOS DO DIA</span>
                <h3 id="birthday-day-title">{formatSelectedDate(selected.date)}</h3>
                <p>{selected.members.length ? `${selected.members.length} ${selected.members.length === 1 ? 'pessoa faz' : 'pessoas fazem'} aniversário` : 'Nenhum aniversariante cadastrado neste dia'}</p>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setSelected(null)}><X size={23} /></button>
            </header>

            <div className={styles.modalContent}>
              {selected.members.length === 0 ? (
                <div className={styles.emptyDay}><Cake size={42} /><strong>Dia livre no calendário</strong><span>Não há aniversários cadastrados para esta data.</span></div>
              ) : selected.members.map((member) => {
                const age = ageInYear(member.birthDate, selected.date.getFullYear());
                return (
                  <button type="button" className={styles.birthdayPerson} key={member.id} onClick={() => { setSelected(null); onOpenMember(member.id); }}>
                    <span className={styles.avatar}>{member.initials}</span>
                    <span className={styles.personInfo}>
                      <strong>{member.name}</strong>
                      <small>{age !== null ? `${age} anos` : 'Idade não calculada'} · {member.ministry}</small>
                      <small>{member.phone}</small>
                    </span>
                    <ChevronRight size={21} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
