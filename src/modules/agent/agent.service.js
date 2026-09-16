const { config } = require('./agent.config');
const { chatCompletion, GatewayError } = require('./agent.gateway');
const { getToolDefinitions, executeTool } = require('./agent.tools');
const memory = require('./agent.memory');
const { getStoreName } = require('../../config/store');

/**
 * Agent orchestration.
 *
 * One user turn runs a bounded tool-calling loop: ask the model, run any tools
 * it requests against real services, feed results back, repeat until it answers
 * or the iteration budget is spent.
 */

/**
 * The system prompt is the agent's real behaviour spec. The constraints below
 * are deliberate — a shopping assistant that invents a price or promises a
 * delivery date creates a real obligation to a real customer.
 */
const buildSystemPrompt = (context) => {
    const storeName = getStoreName();

    return `You are the shopping assistant for ${storeName}, an online fresh meat and seafood delivery store in India. You help customers find products, build their order, and check on deliveries.

HOW YOU MUST BEHAVE

Ground every fact in a tool call. You do not know the catalogue, prices, stock or order statuses from memory — they change constantly. Before stating any product name, price, weight or availability, call the relevant tool and use exactly what it returns. If you have not looked it up in this conversation, look it up now.

Never invent. No made-up products, prices, discounts, delivery dates, or claims about freshness, sourcing or certification. If a tool does not give you the answer, say plainly that you do not have it and offer to help another way.

HOW TO WRITE

You are replying in a small chat bubble on a phone. Keep it short.

- Never use tables, headings, or bold. Plain sentences, or at most a short dash list.
- When showing products, name at most 3 or 4 — the best matches, not everything you found. Offer to show more.
- One line per product: the name, the size that fits what they asked, and the price. Do not list every size unless they ask.
- Do not mention items that fail what they asked for. If they said under ₹400, only show things under ₹400 — silently skip the rest rather than listing them with a note.
- End by moving things forward: which one they want, or the size they need.

Never do arithmetic on prices. Every figure the tools give you is already final and correctly calculated — quote it exactly as given, and never multiply, add or "correct" it. If a total looks surprising, report it anyway.

Use the customer's own words for cuts and dishes — if they say "curry cut", search that. Prices are in rupees, exactly as the tools report them.

ADDING TO THE CART

Only call add_to_cart after the customer has clearly said yes to a specific item and size. Suggesting is not agreement. If they are vague about size, show the options and ask which one.

Never claim something was added unless the tool result says it was. If the tool reports the customer is not signed in, tell them you have prepared the item and they can confirm it, or sign in to save their cart.

You cannot place orders, take payment, apply refunds, or cancel anything. Checkout is always the customer's own final step. If they ask you to complete a purchase, explain that they will need to confirm it at checkout themselves, and offer to get the cart ready.

BOUNDARIES

You do not give medical, dietary or allergy advice. For questions about allergies, illness, pregnancy or medical diets, say it is not something you can advise on and suggest they check with a doctor or contact the store directly.

If asked about anything unrelated to this store, briefly redirect to shopping.

${context.userId ? 'This customer is signed in, so their cart and orders are available to you.' : 'This customer is browsing as a guest. Their cart lives on their device, so you cannot read or modify it directly.'}`;
};

/** Cap user input so a pasted wall of text cannot blow the token budget. */
const sanitiseMessage = (message) => {
    const text = String(message || '').trim();
    if (!text) return null;
    return text.length > config.maxMessageLength
        ? text.slice(0, config.maxMessageLength)
        : text;
};

/**
 * Run one user turn to completion.
 *
 * Returns the assistant's reply plus any client-side actions the browser must
 * apply (guest cart additions), and the tools that ran — the widget uses that
 * to show what the agent actually did rather than asking for blind trust.
 */
const runTurn = async ({ message, sessionId, context, signal }) => {
    const userMessage = sanitiseMessage(message);
    if (!userMessage) {
        const err = new Error('Message cannot be empty.');
        err.statusCode = 400;
        throw err;
    }

    const history = await memory.loadConversation(sessionId);

    const messages = [
        { role: 'system', content: buildSystemPrompt(context) },
        ...history,
        { role: 'user', content: userMessage },
    ];

    const toolDefinitions = getToolDefinitions();
    const toolsUsed = [];
    const clientActions = [];

    let reply = null;

    for (let iteration = 0; iteration < config.maxToolIterations; iteration += 1) {
        const assistantMessage = await chatCompletion({ messages, tools: toolDefinitions, signal });

        const toolCalls = assistantMessage.tool_calls || [];
        if (toolCalls.length === 0) {
            reply = typeof assistantMessage.content === 'string' ? assistantMessage.content.trim() : '';
            break;
        }

        // The assistant turn requesting the tools must stay in the transcript,
        // or the follow-up tool messages have nothing to attach to. Its content
        // is null when it only calls tools, which the API rejects on the way
        // back in — normalise to an empty string.
        messages.push({
            role: 'assistant',
            content: typeof assistantMessage.content === 'string' ? assistantMessage.content : '',
            tool_calls: toolCalls,
        });

        for (const call of toolCalls) {
            const name = call.function?.name;
            const result = await executeTool(name, call.function?.arguments, context);

            toolsUsed.push(name);

            // Guest cart additions can only be applied by the browser.
            if (result?.requiresClientAction && result.proposal) {
                clientActions.push({ type: 'add_to_cart', ...result.proposal });
            }

            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(result),
            });
        }
    }

    if (reply === null) {
        // Iteration budget exhausted while still calling tools — answer honestly
        // rather than returning nothing.
        reply =
            "I'm having trouble pulling that together right now. Could you tell me a bit more about what you're looking for?";
    }

    await memory.saveConversation(sessionId, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
    ]);

    return { reply, toolsUsed, clientActions };
};

module.exports = { runTurn, buildSystemPrompt, GatewayError };
