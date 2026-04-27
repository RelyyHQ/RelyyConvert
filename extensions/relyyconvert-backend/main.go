package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
)

const extensionID = "com.relyyconvert.backend"

type neutralinoInput struct {
	Port          string `json:"nlPort"`
	Token         string `json:"nlToken"`
	ConnectToken  string `json:"nlConnectToken"`
	ExtensionID   string `json:"nlExtensionId"`
}

type extensionEvent struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func main() {
	log.SetPrefix("[relyyconvert-backend] ")
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	input, err := readNeutralinoInput(os.Stdin)
	if err != nil {
		log.Fatalf("read neutralino input: %v", err)
	}
	if input.ExtensionID == "" {
		input.ExtensionID = extensionID
	}

	client, err := dialNeutralino(input.Port, input.ExtensionID, input.ConnectToken)
	if err != nil {
		log.Fatalf("connect neutralino websocket: %v", err)
	}
	defer client.Close()

	backend := NewBackend(input.Token, client)
	backend.Broadcast("backend.ready", backend.Health())

	for {
		payload, err := client.ReadText()
		if err != nil {
			if err != io.EOF {
				log.Printf("websocket closed: %v", err)
			}
			backend.Cancel()
			return
		}

		var event extensionEvent
		if err := json.Unmarshal(payload, &event); err != nil {
			log.Printf("ignore invalid event: %v", err)
			continue
		}
		backend.Handle(context.Background(), event.Event, event.Data)
	}
}

func readNeutralinoInput(reader io.Reader) (neutralinoInput, error) {
	data, err := io.ReadAll(reader)
	if err != nil {
		return neutralinoInput{}, err
	}
	if len(data) == 0 {
		return neutralinoInput{}, fmt.Errorf("empty startup payload")
	}

	var input neutralinoInput
	if err := json.Unmarshal(data, &input); err != nil {
		return neutralinoInput{}, err
	}
	if input.Port == "" || input.Token == "" || input.ConnectToken == "" {
		return neutralinoInput{}, fmt.Errorf("missing neutralino connection fields")
	}
	return input, nil
}
