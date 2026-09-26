package main

import (
	"log"
	"net/http"
	"time"
)

type capacityPerson struct {
	ID             int       `json:"id"`
	Name           string    `json:"name"`
	WeeklyHours    float64   `json:"weeklyHours"`
	AllocatedHours []float64 `json:"allocatedHours"`
}

// Ranges include complete Monday-Sunday weeks. Each allocation array follows weeks.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, errFrom := time.Parse(time.DateOnly, r.URL.Query().Get("from"))
	to, errTo := time.Parse(time.DateOnly, r.URL.Query().Get("to"))
	if errFrom != nil || errTo != nil || from.Year() < 1 || to.Year() < 1 ||
		to.Before(from) || to.After(from.AddDate(2, 0, 0)) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "from and to must be YYYY-MM-DD dates in order, at most two years apart"})
		return
	}
	from = from.AddDate(0, 0, -(int(from.Weekday())+6)%7)
	to = to.AddDate(0, 0, 6-(int(to.Weekday())+6)%7)
	if to.Year() > 9999 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "effective range must remain within years 0001-9999"})
		return
	}
	weeks := []string{}
	for week := from; !week.After(to); week = week.AddDate(0, 0, 7) {
		weeks = append(weeks, week.Format(time.DateOnly))
	}

	// Expand only the requested calendar days, not assignments' full lifetimes.
	// Every matching assignment row contributes; weekends never enter the sum.
	const query = `
		WITH days AS (
			SELECT $1::date + n AS day
			FROM generate_series(0, $2::date - $1::date) AS n
			WHERE extract(isodow FROM $1::date + n) <= 5
		), allocations AS (
			SELECT a.person_id,
			       d.day - (extract(isodow FROM d.day)::int - 1) AS week,
			       sum(a.hours_per_day) AS hours
			FROM assignments a
			JOIN days d ON d.day BETWEEN a.start_date AND a.end_date
			WHERE a.start_date <= $2::date AND a.end_date >= $1::date
			GROUP BY a.person_id, week
		), weeks AS (
			SELECT $1::date + n * 7 AS week
			FROM generate_series(0, ($2::date - $1::date) / 7) AS n
		)
		SELECT p.id, p.name, p.weekly_hours::float8,
		       array_agg(coalesce(a.hours, 0)::float8 ORDER BY w.week)
		FROM people p
		CROSS JOIN weeks w
		LEFT JOIN allocations a ON a.person_id = p.id AND a.week = w.week
		GROUP BY p.id, p.name, p.weekly_hours
		ORDER BY p.id`
	rows, err := s.db.Query(r.Context(), query, from.Format(time.DateOnly), to.Format(time.DateOnly))
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not load capacity"})
		return
	}
	defer rows.Close()
	people := []capacityPerson{}
	for rows.Next() {
		var person capacityPerson
		if err := rows.Scan(&person.ID, &person.Name, &person.WeeklyHours, &person.AllocatedHours); err != nil {
			log.Printf("capacity scan: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not load capacity"})
			return
		}
		people = append(people, person)
	}
	if err := rows.Err(); err != nil {
		log.Printf("capacity rows: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not load capacity"})
		return
	}
	writeJSON(w, http.StatusOK, struct {
		EffectiveFrom string           `json:"effectiveFrom"`
		EffectiveTo   string           `json:"effectiveTo"`
		Weeks         []string         `json:"weeks"`
		People        []capacityPerson `json:"people"`
	}{from.Format(time.DateOnly), to.Format(time.DateOnly), weeks, people})
}
