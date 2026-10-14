package main

import "testing"

func TestBanner(t *testing.T) {
	if got := banner(); got != "payments-lab worker" {
		t.Fatalf("banner() = %q, esperado %q", got, "payments-lab worker")
	}
}
