var titleTemplate = _.template(
  "<tr>" +
      "<th></th>" +
      "<th>Links</th>" +
      "<th>Title</th>" +
      "<th>User</th>" +
      "<th>Updated</th>" +
  "</tr>");

var rowTemplate = _.template(
  "<tr>" +
    "<td><%= pr.number %></td>" +
    "<td><%= links %></td>" +
    "<td><%= pr.title %></td>" +
    "<td><%= pr.userLogin %></td>" +
    "<td sorttable_customkey='<%= updated_stamp %>'><%= updated_str %></td>" +
  "</tr>");

// Key prefixes used in local storage
var PR_SUMMARY_PREFIX = "pr_summary_"
var PR_DETAIL_PREFIX = "pr_detail_"
var JIRA_DETAIL_PREFIX = "jira_detail_"
var GITHUB_API_TOKEN = "github_token"

$(document).ready(function() {
  // Prep tables
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });

  // Clear local PR cache
  var prKeys = _.filter(_.keys(localStorage), function(k) {
    return k.indexOf(PR_SUMMARY_PREFIX) == 0
  });
  _.each(prKeys, function(k) { localStorage.removeItem(k); });

  $("#github-token-input").change(function(event) {
    localStorage[GITHUB_API_TOKEN] = $(event.target).val();
    fetchPRList();
  });

  if (localStorage[GITHUB_API_TOKEN]) {
    $("#github-token-input").val(localStorage[GITHUB_API_TOKEN])
    fetchPRList();
  }
});

function fetchPrPage(pageNum) {
  $.ajax({
    url: "https://api.github.com/repos/apache/spark/pulls?per_page=100&page=" + pageNum,
    success: function(data, status) {
      _.each(data, function(pr) {
        // Because local storage space is limited, we extract only the fields we need
        var prShort = {};
        prShort.updated_at = pr.updated_at;
        prShort.number = pr.number;
        prShort.userLogin = pr.user.login;
        prShort.title = pr.title;
        localStorage[PR_SUMMARY_PREFIX + pr.id] = JSON.stringify(prShort)
      });
      render();
    },
    error: function(xhr, status, error) {
      alert("Response from github: " + status + ", " + error);
    },
    beforeSend: function(xhr) {
      var gitApiToken = localStorage[GITHUB_API_TOKEN];
      xhr.setRequestHeader("Authorization", "Basic " + btoa(gitApiToken + ":x-oauth-basic"));
    }
  });
}

// Kick off an asynchronous fetch of PR data from github.
function fetchPRList() {
  fetchPrPage(1);
  fetchPrPage(2);
  fetchPrPage(3);
  fetchPrPage(4);
};

function createRow(pr) {
  var linksTemplate = _.template(
    "[<a href='<%= github_pr_url %>/<%= pr_num %>'>pr</a>]" +
    "[<a href='<%= github_pr_url %>/<%= pr_num %>/files'>files</a>]" +
    "<% if (jira_id != null) { %>" +
    "[<a href='<%= jira_url %>/<%= jira_id %>'>JIRA</a>]" +
    "<% } %>");


  var jiraRegex = pr.title.match(/SPARK-\d+/);
  var jiraId = jiraRegex == null ? null : jiraRegex[0];

  var links = linksTemplate({
    github_pr_url: "https://github.com/apache/spark/pull",
    jira_url: "https://issues.apache.org/jira/browse",
    pr_num: pr.number,
    jira_id: jiraId});


  return rowTemplate({
    "pr": pr,
    updated_str: $.timeago(new Date(pr.updated_at)),
    updated_stamp: new Date(pr.updated_at).getTime(),
    links: links});
};

function addPRToTable(json) {
  var title = json.title;
  if (title.search(/SQL/i) >= 0) {
    $("#sql-table").append(createRow(json));
  }
  else if (title.search(/MLLIB/i) >= 0) {
    $("#mllib-table").append(createRow(json));
  }
  else if (title.search(/GRAPHX/i) >= 0) {
    $("#graphx-table").append(createRow(json));
  }
  else if (title.search(/PYTHON/i) >= 0 || title.search(/PYSPARK/i) >= 0) {
    $("#pyspark-table").append(createRow(json));
  }
  else if (title.search(/YARN/i) >= 0) {
    $("#yarn-table").append(createRow(json));
  }
  else if (title.search(/STREAM/i) >= 0) {
    $("#streaming-table").append(createRow(json));
  } else {
    $("#core-table").append(createRow(json));
  }
};

// Re-render the list of fetched PR's. Idempotent.
function render() {
  _.each($("table"), function(t) { $(t).empty() });
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });

  var prKeys = _.filter(_.keys(localStorage), function(k) { return k.indexOf(PR_SUMMARY_PREFIX) == 0 });
  var prTuples = _.map(prKeys, function(k) { return [k, JSON.parse(localStorage[k])] });

  // Default sort based on updated date
  prTuples.sort(function (a, b) {
    if (a[1].updated_at > b[1].updated_at) { return 1 }
    if (a[1].updated_at < b[1].updated_at) { return -1 }
    return 0
  }).reverse();

  _.each(prTuples, function (tuple) {
    addPRToTable(tuple[1]);
  });

  _.each($("table"), function(t) {
    sorttable.makeSortable(t);

    // Hack to make it clear the columns are sortable
    var updated = $(t).find("th").filter(function(idx, th) { return $(th).html() == "Updated"; })
    $(updated).append("<span id='sorttable_sortfwdind'>&nbsp;&#9662;</span>");
  });
};

