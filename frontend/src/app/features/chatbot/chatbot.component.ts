import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ChatbotService } from './chatbot.service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  resolvedAutonomously?: boolean;
  escalatedToHuman?: boolean;
}

/** Chatbot IA / Agente Nivel 1 (plan `2.txt`, módulo 2): conversación en tiempo
 * real con NovaBot. Solo `check_ticket_status` y `search_kb` se resuelven de
 * forma realmente autónoma; el resto de solicitudes escalan creando un ticket
 * real (ver ai-service/app/modules/chatbot/tools.py). */
@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './chatbot.component.html',
})
export class ChatbotComponent {
  private readonly fb = inject(FormBuilder);
  private readonly chatbotService = inject(ChatbotService);
  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');

  private sessionId?: string;

  readonly messages = signal<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        '¡Hola! Soy NovaBot, tu asistente de soporte TI. Puedo consultar el estado de tus tickets, buscar artículos de ayuda, o derivar tu solicitud a un técnico. ¿En qué te ayudo?',
    },
  ]);
  readonly sending = signal(false);

  form = this.fb.nonNullable.group({
    message: ['', Validators.required],
  });

  send(): void {
    if (this.form.invalid || this.sending()) return;
    const { message } = this.form.getRawValue();

    this.messages.update((msgs) => [...msgs, { role: 'user', content: message }]);
    this.form.reset();
    this.sending.set(true);
    this.scrollToBottom();

    this.chatbotService.sendMessage(message, this.sessionId).subscribe({
      next: (response) => {
        this.sessionId = response.sessionId;
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: response.reply,
            resolvedAutonomously: response.resolvedAutonomously,
            escalatedToHuman: response.escalatedToHuman,
          },
        ]);
        this.sending.set(false);
        this.scrollToBottom();
      },
      error: () => {
        this.messages.update((msgs) => [
          ...msgs,
          {
            role: 'assistant',
            content: 'El asistente virtual no está disponible en este momento; tu mensaje fue derivado a un técnico.',
            escalatedToHuman: true,
          },
        ]);
        this.sending.set(false);
        this.scrollToBottom();
      },
    });
  }

  private scrollToBottom(): void {
    setTimeout(() => this.scrollAnchor()?.nativeElement.scrollIntoView({ behavior: 'smooth' }), 0);
  }
}
