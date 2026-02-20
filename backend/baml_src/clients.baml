// The Cortex — LLM Client Configuration
// Uses OpenRouter's native BAML provider for model-agnostic access.
// Swap the model string to switch LLMs without touching Python code.

client<llm> OpenRouterModel {
  provider openrouter
  options {
    model "anthropic/claude-3.5-sonnet"
    api_key env.OPENROUTER_API_KEY
    temperature 0.7
    max_tokens 1024
  }
}
