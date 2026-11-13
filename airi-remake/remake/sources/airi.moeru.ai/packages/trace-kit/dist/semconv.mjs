//#region src/conventions/semconv.ts
/** The semantic-conventions-genai commit that these constants come from. */
const SEMCONV_GENAI_COMMIT = "e6658f14c9d9ea0760825f029cb82e7673f48fab";
/**
* Free-form description of the GenAI agent provided by the application.
* Stability: `development`.
*/
const ATTR_GEN_AI_AGENT_DESCRIPTION = "gen_ai.agent.description";
/**
* The unique and stable identifier of the GenAI hosted agent resource.
* Stability: `development`.
*/
const ATTR_GEN_AI_AGENT_ID = "gen_ai.agent.id";
/**
* Human-readable name of the GenAI agent or workflow provided by the application.
* Stability: `development`.
*/
const ATTR_GEN_AI_AGENT_NAME = "gen_ai.agent.name";
/**
* The version of the GenAI agent.
* Stability: `development`.
*/
const ATTR_GEN_AI_AGENT_VERSION = "gen_ai.agent.version";
/**
* Indicates whether the effective conversation context used for this operation is a compacted view of a prior conversation.
* Stability: `development`.
*/
const ATTR_GEN_AI_CONVERSATION_COMPACTED = "gen_ai.conversation.compacted";
/**
* The unique identifier for a conversation (session, thread), used to store and correlate messages within this conversation.
* Stability: `development`.
*/
const ATTR_GEN_AI_CONVERSATION_ID = "gen_ai.conversation.id";
/**
* The data source identifier.
* Stability: `development`.
*/
const ATTR_GEN_AI_DATA_SOURCE_ID = "gen_ai.data_source.id";
/**
* The number of dimensions the resulting output embeddings should have.
* Stability: `development`.
*/
const ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT = "gen_ai.embeddings.dimension.count";
/**
* A free-form explanation for the assigned score provided by the evaluator.
* Stability: `development`.
*/
const ATTR_GEN_AI_EVALUATION_EXPLANATION = "gen_ai.evaluation.explanation";
/**
* The name of the evaluation metric used for the GenAI response.
* Stability: `development`.
*/
const ATTR_GEN_AI_EVALUATION_NAME = "gen_ai.evaluation.name";
/**
* Human readable label for evaluation.
* Stability: `development`.
*/
const ATTR_GEN_AI_EVALUATION_SCORE_LABEL = "gen_ai.evaluation.score.label";
/**
* The evaluation score returned by the evaluator.
* Stability: `development`.
*/
const ATTR_GEN_AI_EVALUATION_SCORE_VALUE = "gen_ai.evaluation.score.value";
/**
* The chat history provided to the model as an input.
* Stability: `development`.
*/
const ATTR_GEN_AI_INPUT_MESSAGES = "gen_ai.input.messages";
/**
* An absolute URI identifying the input messages in external storage.
* Stability: `development`.
*/
const ATTR_GEN_AI_INPUT_MESSAGES_REF = "gen_ai.input.messages_ref";
/**
* The free-form description of the top-level Generative AI agent in the process.
* Stability: `development`.
*/
const ATTR_GEN_AI_MAIN_AGENT_DESCRIPTION = "gen_ai.main_agent.description";
/**
* The unique and stable identifier of the top-level Generative AI agent in the process
* Stability: `development`.
*/
const ATTR_GEN_AI_MAIN_AGENT_ID = "gen_ai.main_agent.id";
/**
* The human-readable name of the top-level Generative AI agent in the process.
* Stability: `development`.
*/
const ATTR_GEN_AI_MAIN_AGENT_NAME = "gen_ai.main_agent.name";
/**
* The search query used to retrieve memories.
* Stability: `development`.
*/
const ATTR_GEN_AI_MEMORY_QUERY_TEXT = "gen_ai.memory.query.text";
/**
* The number of memory records relevant to the operation.
* Stability: `development`.
*/
const ATTR_GEN_AI_MEMORY_RECORD_COUNT = "gen_ai.memory.record.count";
/**
* The unique identifier of the memory record.
* Stability: `development`.
*/
const ATTR_GEN_AI_MEMORY_RECORD_ID = "gen_ai.memory.record.id";
/**
* The memory records stored or retrieved in a memory operation.
* Stability: `development`.
*/
const ATTR_GEN_AI_MEMORY_RECORDS = "gen_ai.memory.records";
/**
* The unique identifier of the memory store.
* Stability: `development`.
*/
const ATTR_GEN_AI_MEMORY_STORE_ID = "gen_ai.memory.store.id";
/**
* The name of the operation being performed.
* Stability: `development`.
*/
const ATTR_GEN_AI_OPERATION_NAME = "gen_ai.operation.name";
/**
* Chat completion operation such as [OpenAI Chat API](https://platform.openai.com/docs/api-reference/chat)
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_CHAT = "chat";
/**
* Multimodal content generation operation such as [Gemini Generate Content](https://ai.google.dev/api/generate-content)
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT = "generate_content";
/**
* Server-side model generation within a realtime, bidirectional streaming session such as [OpenAI Realtime](https://platform.openai.com/docs/guides/realtime) or [Gemini Live](https://ai.google.dev/gemini-api/docs/live).
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_REALTIME_INFERENCE = "realtime_inference";
/**
* Describes the process of recording user speech input.
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_USER_SPEECH = "user_speech";
/**
* Text completions operation such as [OpenAI Completions API (Legacy)](https://platform.openai.com/docs/api-reference/completions)
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION = "text_completion";
/**
* Embeddings operation such as [OpenAI Create embeddings API](https://platform.openai.com/docs/api-reference/embeddings/create)
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS = "embeddings";
/**
* Execution of a retrieval pipeline that returns documents relevant to a query
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL = "retrieval";
/**
* Fetch a previously generated model response by its identifier, without performing inference, such as [OpenAI Get a model response](https://platform.openai.com/docs/api-reference/responses/get)
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE = "fetch_response";
/**
* Create GenAI agent
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT = "create_agent";
/**
* Invoke GenAI agent
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT = "invoke_agent";
/**
* Execute a tool
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL = "execute_tool";
/**
* Invoke GenAI workflow
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW = "invoke_workflow";
/**
* Invoke a framework runner that is not itself an agent or a workflow
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER = "invoke_runner";
/**
* Agent planning or task decomposition phase
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_PLAN = "plan";
/**
* Search/query memories from a memory store
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_SEARCH_MEMORY = "search_memory";
/**
* Create new memory records
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_CREATE_MEMORY = "create_memory";
/**
* Update existing memory records
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_UPDATE_MEMORY = "update_memory";
/**
* Create or update memory records without the caller choosing which
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_UPSERT_MEMORY = "upsert_memory";
/**
* Delete memory records
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_DELETE_MEMORY = "delete_memory";
/**
* Create or initialize a memory store
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_CREATE_MEMORY_STORE = "create_memory_store";
/**
* Delete or deprovision a memory store
* Stability: `development`.
*/
const GEN_AI_OPERATION_NAME_VALUE_DELETE_MEMORY_STORE = "delete_memory_store";
/**
* Messages returned by the model where each message represents a specific model response (choice, candidate).
* Stability: `development`.
*/
const ATTR_GEN_AI_OUTPUT_MESSAGES = "gen_ai.output.messages";
/**
* An absolute URI identifying the output messages in external storage.
* Stability: `development`.
*/
const ATTR_GEN_AI_OUTPUT_MESSAGES_REF = "gen_ai.output.messages_ref";
/**
* Represents the content type requested by the client.
* Stability: `development`.
*/
const ATTR_GEN_AI_OUTPUT_TYPE = "gen_ai.output.type";
/**
* Plain text
* Stability: `development`.
*/
const GEN_AI_OUTPUT_TYPE_VALUE_TEXT = "text";
/**
* JSON object with known or unknown schema
* Stability: `development`.
*/
const GEN_AI_OUTPUT_TYPE_VALUE_JSON = "json";
/**
* Image
* Stability: `development`.
*/
const GEN_AI_OUTPUT_TYPE_VALUE_IMAGE = "image";
/**
* Speech
* Stability: `development`.
*/
const GEN_AI_OUTPUT_TYPE_VALUE_SPEECH = "speech";
/**
* The name of the prompt that uniquely identifies it.
* Stability: `development`.
*/
const ATTR_GEN_AI_PROMPT_NAME = "gen_ai.prompt.name";
/**
* The variables supplied to the prompt template, the `<key>` being the variable name, the value being the variable value.
* Stability: `development`.
*/
const ATTR_GEN_AI_PROMPT_VARIABLE = "gen_ai.prompt.variable";
/**
* The version of the prompt template used.
* Stability: `development`.
*/
const ATTR_GEN_AI_PROMPT_VERSION = "gen_ai.prompt.version";
/**
* The Generative AI provider as identified by the client or server instrumentation.
* Stability: `development`.
*/
const ATTR_GEN_AI_PROVIDER_NAME = "gen_ai.provider.name";
/**
* [OpenAI](https://openai.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_OPENAI = "openai";
/**
* Any Google generative AI endpoint
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI = "gcp.gen_ai";
/**
* [Vertex AI](https://cloud.google.com/vertex-ai)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI = "gcp.vertex_ai";
/**
* [Gemini](https://cloud.google.com/products/gemini)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI = "gcp.gemini";
/**
* [Anthropic](https://www.anthropic.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC = "anthropic";
/**
* [Cohere](https://cohere.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_COHERE = "cohere";
/**
* Azure AI Inference
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE = "azure.ai.inference";
/**
* [Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-services/openai/overview)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI = "azure.ai.openai";
/**
* [IBM Watsonx AI](https://www.ibm.com/products/watsonx-ai)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI = "ibm.watsonx.ai";
/**
* [AWS Bedrock](https://aws.amazon.com/bedrock)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK = "aws.bedrock";
/**
* [Perplexity](https://www.perplexity.ai/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY = "perplexity";
/**
* [xAI](https://x.ai/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_X_AI = "x_ai";
/**
* [DeepSeek](https://www.deepseek.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK = "deepseek";
/**
* [Groq](https://groq.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_GROQ = "groq";
/**
* [Mistral](https://mistral.ai/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_MISTRAL = "mistral";
/**
* [Moonshot AI](https://www.moonshot.ai/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT_AI = "moonshot_ai";
/**
* [Ollama](https://ollama.com/)
* Stability: `development`.
*/
const GEN_AI_PROVIDER_NAME_VALUE_OLLAMA = "ollama";
/**
* The unique identifier for a realtime, bidirectional streaming session.
* Stability: `development`.
*/
const ATTR_GEN_AI_REALTIME_SESSION_ID = "gen_ai.realtime_session.id";
/**
* The target number of candidate completions to return.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_CHOICE_COUNT = "gen_ai.request.choice.count";
/**
* The encoding formats requested in an embeddings operation, if specified.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_ENCODING_FORMATS = "gen_ai.request.encoding_formats";
/**
* The frequency penalty setting for the GenAI request.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY = "gen_ai.request.frequency_penalty";
/**
* The maximum number of tokens the model generates for a request.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_MAX_TOKENS = "gen_ai.request.max_tokens";
/**
* The name of the GenAI model a request is being made to.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_MODEL = "gen_ai.request.model";
/**
* The presence penalty setting for the GenAI request.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY = "gen_ai.request.presence_penalty";
/**
* The unique identifier of a previous response or interaction used to provide context for the current operation.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID = "gen_ai.request.previous_response.id";
/**
* The reasoning or thinking effort level requested for a GenAI model.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_REASONING_LEVEL = "gen_ai.request.reasoning.level";
/**
* Requests with same seed value more likely to return same result.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_SEED = "gen_ai.request.seed";
/**
* List of sequences that the model will use to stop generating further tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_STOP_SEQUENCES = "gen_ai.request.stop_sequences";
/**
* Indicates whether the GenAI request was made in streaming mode.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_STREAM = "gen_ai.request.stream";
/**
* The cursor identifying the last streamed event already received, used to resume a streamed response from that position.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_STREAM_CURSOR = "gen_ai.request.stream_cursor";
/**
* The temperature setting for the GenAI request.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_TEMPERATURE = "gen_ai.request.temperature";
/**
* The top-K sampling setting for the GenAI request: restricts token generation at each step to the K most likely next tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_TOP_K = "gen_ai.request.top_k";
/**
* The top_p sampling setting for the GenAI request.
* Stability: `development`.
*/
const ATTR_GEN_AI_REQUEST_TOP_P = "gen_ai.request.top_p";
/**
* Array of reasons the model stopped generating tokens, corresponding to each generation received.
* Stability: `development`.
*/
const ATTR_GEN_AI_RESPONSE_FINISH_REASONS = "gen_ai.response.finish_reasons";
/**
* The unique identifier for the completion.
* Stability: `development`.
*/
const ATTR_GEN_AI_RESPONSE_ID = "gen_ai.response.id";
/**
* The name of the model that generated the response.
* Stability: `development`.
*/
const ATTR_GEN_AI_RESPONSE_MODEL = "gen_ai.response.model";
/**
* The lifecycle status of a generated response, as reported by the provider when the response is fetched or polled.
* Stability: `development`.
*/
const ATTR_GEN_AI_RESPONSE_STATUS = "gen_ai.response.status";
/**
* The response has been accepted by the provider but generation has not started yet.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_QUEUED = "queued";
/**
* The response is still being generated, for example a background or streamed response that has not finished.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_IN_PROGRESS = "in_progress";
/**
* The response finished generating successfully.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED = "completed";
/**
* The response stopped before generation completed, for example because a token limit or content filter was reached.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_INCOMPLETE = "incomplete";
/**
* The response generation failed with an error.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_FAILED = "failed";
/**
* The response generation was cancelled before it completed.
* Stability: `development`.
*/
const GEN_AI_RESPONSE_STATUS_VALUE_CANCELLED = "cancelled";
/**
* Time from the start of a logical inference operation to the first chunk in its streaming response, in seconds.
* Stability: `development`.
*/
const ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK = "gen_ai.response.time_to_first_chunk";
/**
* The documents retrieved.
* Stability: `development`.
*/
const ATTR_GEN_AI_RETRIEVAL_DOCUMENTS = "gen_ai.retrieval.documents";
/**
* The query text used for retrieval.
* Stability: `development`.
*/
const ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT = "gen_ai.retrieval.query.text";
/**
* The maximum number of documents the retriever was asked to return for the query (also known as `k`, `limit`, or `max_num_results`).
* Stability: `development`.
*/
const ATTR_GEN_AI_RETRIEVAL_TOP_K = "gen_ai.retrieval.top_k";
/**
* The [description of the Agent Skill](https://agentskills.io/specification#skill-md-format).
* Stability: `development`.
*/
const ATTR_GEN_AI_SKILL_DESCRIPTION = "gen_ai.skill.description";
/**
* The name of the [Agent Skill](https://agentskills.io/specification#skill-md-format).
* Stability: `development`.
*/
const ATTR_GEN_AI_SKILL_NAME = "gen_ai.skill.name";
/**
* The skill-relative name of the resource (script, reference, or asset) being accessed or executed.
* Stability: `development`.
*/
const ATTR_GEN_AI_SKILL_RESOURCE_NAME = "gen_ai.skill.resource.name";
/**
* The source URI for loading the skill.
* Stability: `development`.
*/
const ATTR_GEN_AI_SKILL_SOURCE_URI = "gen_ai.skill.source.uri";
/**
* The system message or instructions provided to the GenAI model separately from the chat history.
* Stability: `development`.
*/
const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS = "gen_ai.system_instructions";
/**
* An absolute URI identifying the system instructions in external storage.
* Stability: `development`.
*/
const ATTR_GEN_AI_SYSTEM_INSTRUCTIONS_REF = "gen_ai.system_instructions_ref";
/**
* The modality of the tokens being counted.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOKEN_MODALITY = "gen_ai.token.modality";
/**
* Text tokens.
* Stability: `development`.
*/
const GEN_AI_TOKEN_MODALITY_VALUE_TEXT = "text";
/**
* Image tokens.
* Stability: `development`.
*/
const GEN_AI_TOKEN_MODALITY_VALUE_IMAGE = "image";
/**
* Audio tokens.
* Stability: `development`.
*/
const GEN_AI_TOKEN_MODALITY_VALUE_AUDIO = "audio";
/**
* The modality is not known.
* Stability: `development`.
*/
const GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN = "unknown";
/**
* Parameters passed to the tool call.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_CALL_ARGUMENTS = "gen_ai.tool.call.arguments";
/**
* The tool call identifier supplied by the model or provider.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_CALL_ID = "gen_ai.tool.call.id";
/**
* The result returned by the tool call (if any and if execution was successful).
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_CALL_RESULT = "gen_ai.tool.call.result";
/**
* The list of tool definitions available to the GenAI agent or model.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_DEFINITIONS = "gen_ai.tool.definitions";
/**
* An absolute URI identifying the tool definitions in external storage.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_DEFINITIONS_REF = "gen_ai.tool.definitions_ref";
/**
* The tool description.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_DESCRIPTION = "gen_ai.tool.description";
/**
* Name of the tool utilized by the agent.
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_NAME = "gen_ai.tool.name";
/**
* Type of the tool utilized by the agent
* Stability: `development`.
*/
const ATTR_GEN_AI_TOOL_TYPE = "gen_ai.tool.type";
/**
* Describes how control passes to the transfer target.
* Stability: `development`.
*/
const ATTR_GEN_AI_TRANSFER_MODE = "gen_ai.transfer.mode";
/**
* The initiator waits for the target to finish and then resumes execution.
* Stability: `development`.
*/
const GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER = "return_to_caller";
/**
* The initiator does not wait for the target to finish. The target takes control of the remaining work.
* Stability: `development`.
*/
const GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL = "pass_control";
/**
* The human-readable name of the agent targeted by the transfer.
* Stability: `development`.
*/
const ATTR_GEN_AI_TRANSFER_TARGET_NAME = "gen_ai.transfer.target.name";
/**
* The number of audio input tokens served from a provider-managed cache.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS = "gen_ai.usage.audio.cache_read.input_tokens";
/**
* The number of audio input tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS = "gen_ai.usage.audio.input_tokens";
/**
* The number of audio output tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS = "gen_ai.usage.audio.output_tokens";
/**
* The number of input tokens served from a provider-managed cache.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS = "gen_ai.usage.cache_read.input_tokens";
/**
* The number of input tokens written to a provider-managed cache.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS = "gen_ai.usage.cache_write.input_tokens";
/**
* The number of image input tokens served from a provider-managed cache.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS = "gen_ai.usage.image.cache_read.input_tokens";
/**
* The number of image input tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS = "gen_ai.usage.image.input_tokens";
/**
* The number of image output tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS = "gen_ai.usage.image.output_tokens";
/**
* The total number of input (prompt) tokens across all modalities.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_INPUT_TOKENS = "gen_ai.usage.input_tokens";
/**
* The total number of output (completion) tokens across all modalities.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
/**
* The number of output tokens used for reasoning (e.g. chain-of-thought, extended thinking).
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS = "gen_ai.usage.reasoning.output_tokens";
/**
* The number of text input tokens served from a provider-managed cache.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS = "gen_ai.usage.text.cache_read.input_tokens";
/**
* The number of text input tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS = "gen_ai.usage.text.input_tokens";
/**
* The number of text output tokens.
* Stability: `development`.
*/
const ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS = "gen_ai.usage.text.output_tokens";
/**
* GenAI client embeddings operation duration.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_EMBEDDINGS_DURATION = "gen_ai.client.embeddings.duration";
/**
* The number of input tokens used per embeddings operation.
* Instrument: `histogram`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_EMBEDDINGS_OPERATION_INPUT_TOKENS = "gen_ai.client.embeddings.operation.input_tokens";
/**
* GenAI client inference operation duration.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_DURATION = "gen_ai.client.inference.duration";
/**
* The number of input (prompt) tokens used per inference operation.
* Instrument: `histogram`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS = "gen_ai.client.inference.operation.input_tokens";
/**
* The number of output (completion) tokens used per inference operation.
* Instrument: `histogram`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS = "gen_ai.client.inference.operation.output_tokens";
/**
* Time per output chunk, recorded for each chunk received after the first one, measured as the time elapsed from the end of the previous chunk to the end of the current chunk.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_TIME_PER_OUTPUT_CHUNK = "gen_ai.client.inference.time_per_output_chunk";
/**
* Time from the start of a logical inference operation to the first chunk in its streaming response.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_TIME_TO_FIRST_CHUNK = "gen_ai.client.inference.time_to_first_chunk";
/**
* The number of input tokens served from a provider-managed cache.
* Instrument: `counter`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS = "gen_ai.client.inference.usage.cache_read.input_tokens";
/**
* The number of input tokens written to a provider-managed cache.
* Instrument: `counter`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS = "gen_ai.client.inference.usage.cache_write.input_tokens";
/**
* The number of input (prompt) tokens used, including cached tokens.
* Instrument: `counter`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS = "gen_ai.client.inference.usage.input_tokens";
/**
* The number of output (completion) tokens used, including reasoning tokens.
* Instrument: `counter`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS = "gen_ai.client.inference.usage.output_tokens";
/**
* The number of output tokens used for reasoning (e.g. chain-of-thought, extended thinking).
* Instrument: `counter`. Unit: `{token}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS = "gen_ai.client.inference.usage.reasoning.output_tokens";
/**
* GenAI client invoke agent operation duration.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION = "gen_ai.client.invoke_agent.duration";
/**
* GenAI operation duration.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_CLIENT_OPERATION_DURATION = "gen_ai.client.operation.duration";
/**
* The duration of a single tool execution.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_EXECUTE_TOOL_DURATION = "gen_ai.execute_tool.duration";
/**
* The end-to-end duration of a single in-process agent, workflow, or framework entrypoint invocation, from the moment the invocation starts until it emits the last chunk of its final response or terminates with an error.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_INVOKE_AGENT_DURATION = "gen_ai.invoke_agent.duration";
/**
* The number of inference (model) calls a GenAI agent, workflow, or framework entrypoint makes during a single invocation.
* Instrument: `histogram`. Unit: `{inference_call}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS = "gen_ai.invoke_agent.inference_calls";
/**
* The number of tool calls a GenAI agent, workflow, or framework entrypoint makes during a single invocation.
* Instrument: `histogram`. Unit: `{tool_call}`.
* Stability: `development`.
*/
const METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS = "gen_ai.invoke_agent.tool_calls";
/**
* The duration of a retrieval operation - an execution of a framework retrieval pipeline that returns documents relevant to a query.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_RETRIEVAL_DURATION = "gen_ai.retrieval.duration";
/**
* Generative AI server request duration such as time-to-last byte or last output token.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_SERVER_REQUEST_DURATION = "gen_ai.server.request.duration";
/**
* Time per output token generated after the first token for successful responses.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_SERVER_TIME_PER_OUTPUT_TOKEN = "gen_ai.server.time_per_output_token";
/**
* Time to generate first token for successful responses.
* Instrument: `histogram`. Unit: `s`.
* Stability: `development`.
*/
const METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN = "gen_ai.server.time_to_first_token";
//#endregion
export { ATTR_GEN_AI_AGENT_DESCRIPTION, ATTR_GEN_AI_AGENT_ID, ATTR_GEN_AI_AGENT_NAME, ATTR_GEN_AI_AGENT_VERSION, ATTR_GEN_AI_CONVERSATION_COMPACTED, ATTR_GEN_AI_CONVERSATION_ID, ATTR_GEN_AI_DATA_SOURCE_ID, ATTR_GEN_AI_EMBEDDINGS_DIMENSION_COUNT, ATTR_GEN_AI_EVALUATION_EXPLANATION, ATTR_GEN_AI_EVALUATION_NAME, ATTR_GEN_AI_EVALUATION_SCORE_LABEL, ATTR_GEN_AI_EVALUATION_SCORE_VALUE, ATTR_GEN_AI_INPUT_MESSAGES, ATTR_GEN_AI_INPUT_MESSAGES_REF, ATTR_GEN_AI_MAIN_AGENT_DESCRIPTION, ATTR_GEN_AI_MAIN_AGENT_ID, ATTR_GEN_AI_MAIN_AGENT_NAME, ATTR_GEN_AI_MEMORY_QUERY_TEXT, ATTR_GEN_AI_MEMORY_RECORDS, ATTR_GEN_AI_MEMORY_RECORD_COUNT, ATTR_GEN_AI_MEMORY_RECORD_ID, ATTR_GEN_AI_MEMORY_STORE_ID, ATTR_GEN_AI_OPERATION_NAME, ATTR_GEN_AI_OUTPUT_MESSAGES, ATTR_GEN_AI_OUTPUT_MESSAGES_REF, ATTR_GEN_AI_OUTPUT_TYPE, ATTR_GEN_AI_PROMPT_NAME, ATTR_GEN_AI_PROMPT_VARIABLE, ATTR_GEN_AI_PROMPT_VERSION, ATTR_GEN_AI_PROVIDER_NAME, ATTR_GEN_AI_REALTIME_SESSION_ID, ATTR_GEN_AI_REQUEST_CHOICE_COUNT, ATTR_GEN_AI_REQUEST_ENCODING_FORMATS, ATTR_GEN_AI_REQUEST_FREQUENCY_PENALTY, ATTR_GEN_AI_REQUEST_MAX_TOKENS, ATTR_GEN_AI_REQUEST_MODEL, ATTR_GEN_AI_REQUEST_PRESENCE_PENALTY, ATTR_GEN_AI_REQUEST_PREVIOUS_RESPONSE_ID, ATTR_GEN_AI_REQUEST_REASONING_LEVEL, ATTR_GEN_AI_REQUEST_SEED, ATTR_GEN_AI_REQUEST_STOP_SEQUENCES, ATTR_GEN_AI_REQUEST_STREAM, ATTR_GEN_AI_REQUEST_STREAM_CURSOR, ATTR_GEN_AI_REQUEST_TEMPERATURE, ATTR_GEN_AI_REQUEST_TOP_K, ATTR_GEN_AI_REQUEST_TOP_P, ATTR_GEN_AI_RESPONSE_FINISH_REASONS, ATTR_GEN_AI_RESPONSE_ID, ATTR_GEN_AI_RESPONSE_MODEL, ATTR_GEN_AI_RESPONSE_STATUS, ATTR_GEN_AI_RESPONSE_TIME_TO_FIRST_CHUNK, ATTR_GEN_AI_RETRIEVAL_DOCUMENTS, ATTR_GEN_AI_RETRIEVAL_QUERY_TEXT, ATTR_GEN_AI_RETRIEVAL_TOP_K, ATTR_GEN_AI_SKILL_DESCRIPTION, ATTR_GEN_AI_SKILL_NAME, ATTR_GEN_AI_SKILL_RESOURCE_NAME, ATTR_GEN_AI_SKILL_SOURCE_URI, ATTR_GEN_AI_SYSTEM_INSTRUCTIONS, ATTR_GEN_AI_SYSTEM_INSTRUCTIONS_REF, ATTR_GEN_AI_TOKEN_MODALITY, ATTR_GEN_AI_TOOL_CALL_ARGUMENTS, ATTR_GEN_AI_TOOL_CALL_ID, ATTR_GEN_AI_TOOL_CALL_RESULT, ATTR_GEN_AI_TOOL_DEFINITIONS, ATTR_GEN_AI_TOOL_DEFINITIONS_REF, ATTR_GEN_AI_TOOL_DESCRIPTION, ATTR_GEN_AI_TOOL_NAME, ATTR_GEN_AI_TOOL_TYPE, ATTR_GEN_AI_TRANSFER_MODE, ATTR_GEN_AI_TRANSFER_TARGET_NAME, ATTR_GEN_AI_USAGE_AUDIO_CACHE_READ_INPUT_TOKENS, ATTR_GEN_AI_USAGE_AUDIO_INPUT_TOKENS, ATTR_GEN_AI_USAGE_AUDIO_OUTPUT_TOKENS, ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS, ATTR_GEN_AI_USAGE_IMAGE_CACHE_READ_INPUT_TOKENS, ATTR_GEN_AI_USAGE_IMAGE_INPUT_TOKENS, ATTR_GEN_AI_USAGE_IMAGE_OUTPUT_TOKENS, ATTR_GEN_AI_USAGE_INPUT_TOKENS, ATTR_GEN_AI_USAGE_OUTPUT_TOKENS, ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS, ATTR_GEN_AI_USAGE_TEXT_CACHE_READ_INPUT_TOKENS, ATTR_GEN_AI_USAGE_TEXT_INPUT_TOKENS, ATTR_GEN_AI_USAGE_TEXT_OUTPUT_TOKENS, GEN_AI_OPERATION_NAME_VALUE_CHAT, GEN_AI_OPERATION_NAME_VALUE_CREATE_AGENT, GEN_AI_OPERATION_NAME_VALUE_CREATE_MEMORY, GEN_AI_OPERATION_NAME_VALUE_CREATE_MEMORY_STORE, GEN_AI_OPERATION_NAME_VALUE_DELETE_MEMORY, GEN_AI_OPERATION_NAME_VALUE_DELETE_MEMORY_STORE, GEN_AI_OPERATION_NAME_VALUE_EMBEDDINGS, GEN_AI_OPERATION_NAME_VALUE_EXECUTE_TOOL, GEN_AI_OPERATION_NAME_VALUE_FETCH_RESPONSE, GEN_AI_OPERATION_NAME_VALUE_GENERATE_CONTENT, GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT, GEN_AI_OPERATION_NAME_VALUE_INVOKE_RUNNER, GEN_AI_OPERATION_NAME_VALUE_INVOKE_WORKFLOW, GEN_AI_OPERATION_NAME_VALUE_PLAN, GEN_AI_OPERATION_NAME_VALUE_REALTIME_INFERENCE, GEN_AI_OPERATION_NAME_VALUE_RETRIEVAL, GEN_AI_OPERATION_NAME_VALUE_SEARCH_MEMORY, GEN_AI_OPERATION_NAME_VALUE_TEXT_COMPLETION, GEN_AI_OPERATION_NAME_VALUE_UPDATE_MEMORY, GEN_AI_OPERATION_NAME_VALUE_UPSERT_MEMORY, GEN_AI_OPERATION_NAME_VALUE_USER_SPEECH, GEN_AI_OUTPUT_TYPE_VALUE_IMAGE, GEN_AI_OUTPUT_TYPE_VALUE_JSON, GEN_AI_OUTPUT_TYPE_VALUE_SPEECH, GEN_AI_OUTPUT_TYPE_VALUE_TEXT, GEN_AI_PROVIDER_NAME_VALUE_ANTHROPIC, GEN_AI_PROVIDER_NAME_VALUE_AWS_BEDROCK, GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_INFERENCE, GEN_AI_PROVIDER_NAME_VALUE_AZURE_AI_OPENAI, GEN_AI_PROVIDER_NAME_VALUE_COHERE, GEN_AI_PROVIDER_NAME_VALUE_DEEPSEEK, GEN_AI_PROVIDER_NAME_VALUE_GCP_GEMINI, GEN_AI_PROVIDER_NAME_VALUE_GCP_GEN_AI, GEN_AI_PROVIDER_NAME_VALUE_GCP_VERTEX_AI, GEN_AI_PROVIDER_NAME_VALUE_GROQ, GEN_AI_PROVIDER_NAME_VALUE_IBM_WATSONX_AI, GEN_AI_PROVIDER_NAME_VALUE_MISTRAL, GEN_AI_PROVIDER_NAME_VALUE_MOONSHOT_AI, GEN_AI_PROVIDER_NAME_VALUE_OLLAMA, GEN_AI_PROVIDER_NAME_VALUE_OPENAI, GEN_AI_PROVIDER_NAME_VALUE_PERPLEXITY, GEN_AI_PROVIDER_NAME_VALUE_X_AI, GEN_AI_RESPONSE_STATUS_VALUE_CANCELLED, GEN_AI_RESPONSE_STATUS_VALUE_COMPLETED, GEN_AI_RESPONSE_STATUS_VALUE_FAILED, GEN_AI_RESPONSE_STATUS_VALUE_INCOMPLETE, GEN_AI_RESPONSE_STATUS_VALUE_IN_PROGRESS, GEN_AI_RESPONSE_STATUS_VALUE_QUEUED, GEN_AI_TOKEN_MODALITY_VALUE_AUDIO, GEN_AI_TOKEN_MODALITY_VALUE_IMAGE, GEN_AI_TOKEN_MODALITY_VALUE_TEXT, GEN_AI_TOKEN_MODALITY_VALUE_UNKNOWN, GEN_AI_TRANSFER_MODE_VALUE_PASS_CONTROL, GEN_AI_TRANSFER_MODE_VALUE_RETURN_TO_CALLER, METRIC_GEN_AI_CLIENT_EMBEDDINGS_DURATION, METRIC_GEN_AI_CLIENT_EMBEDDINGS_OPERATION_INPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_DURATION, METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_INPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_OPERATION_OUTPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_TIME_PER_OUTPUT_CHUNK, METRIC_GEN_AI_CLIENT_INFERENCE_TIME_TO_FIRST_CHUNK, METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_READ_INPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_CACHE_WRITE_INPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_INPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_OUTPUT_TOKENS, METRIC_GEN_AI_CLIENT_INFERENCE_USAGE_REASONING_OUTPUT_TOKENS, METRIC_GEN_AI_CLIENT_INVOKE_AGENT_DURATION, METRIC_GEN_AI_CLIENT_OPERATION_DURATION, METRIC_GEN_AI_EXECUTE_TOOL_DURATION, METRIC_GEN_AI_INVOKE_AGENT_DURATION, METRIC_GEN_AI_INVOKE_AGENT_INFERENCE_CALLS, METRIC_GEN_AI_INVOKE_AGENT_TOOL_CALLS, METRIC_GEN_AI_RETRIEVAL_DURATION, METRIC_GEN_AI_SERVER_REQUEST_DURATION, METRIC_GEN_AI_SERVER_TIME_PER_OUTPUT_TOKEN, METRIC_GEN_AI_SERVER_TIME_TO_FIRST_TOKEN, SEMCONV_GENAI_COMMIT };
