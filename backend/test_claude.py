from dotenv import load_dotenv
import anthropic

load_dotenv()
client = anthropic.Anthropic()

reply = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=300,
    system="You are a Socratic software testing tutor. Never give answers. Ask one guiding question.",
    messages=[{"role": "user", "content": "How do I test a function that returns the larger of two numbers?"}],
)
text = "".join(block.text for block in reply.content if block.type == "text")
print(text)