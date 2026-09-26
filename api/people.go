package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

// Updating recurring capacity affects all weeks, including historical ones.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a positive integer"})
		return
	}
	var input struct {
		WeeklyHours *float64 `json:"weeklyHours"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "expected a JSON object containing weeklyHours"})
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF || input.WeeklyHours == nil ||
		math.IsNaN(*input.WeeklyHours) || math.IsInf(*input.WeeklyHours, 0) || *input.WeeklyHours < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "weeklyHours must be a finite non-negative number in a single JSON object"})
		return
	}
	var person struct {
		ID          int     `json:"id"`
		Name        string  `json:"name"`
		WeeklyHours float64 `json:"weeklyHours"`
	}
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $2
		WHERE id = $1
		RETURNING id, name, weekly_hours::float8`, id, *input.WeeklyHours).
		Scan(&person.ID, &person.Name, &person.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "person not found"})
		return
	}
	if err != nil {
		log.Printf("update person: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "could not update weekly hours"})
		return
	}
	writeJSON(w, http.StatusOK, person)
}
